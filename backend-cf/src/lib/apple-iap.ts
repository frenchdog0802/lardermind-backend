import type { Env } from '../env';
import { AppleJwsError, verifyAppleJws, type VerifyAppleJwsOptions } from './apple-jws';
import type { BillingPeriod } from './stripe';
import {
  getAppleSubscription,
  markAppleNotificationProcessed,
  upsertAppleSubscription,
  wasAppleNotificationProcessed,
  type AppleSubscriptionRow,
} from '../db/apple-subscriptions';

export const DEFAULT_APPLE_BUNDLE_ID = 'com.lardermind.app';

export const APPLE_PRODUCTS: Record<string, BillingPeriod> = {
  'com.lardermind.pro.monthly': 'monthly',
  'com.lardermind.pro.yearly': 'yearly',
};

export type AppleEnvironment = 'Production' | 'Sandbox';

/** Subset of Apple's JWSTransactionDecodedPayload that we use. Dates are unix milliseconds. */
export type AppleTransactionPayload = {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  type?: string;
  purchaseDate?: number;
  expiresDate?: number;
  revocationDate?: number;
  revocationReason?: number;
  offerType?: number; // 1 introductory, 2 promotional, 3 offer code
  offerDiscountType?: string; // FREE_TRIAL | PAY_AS_YOU_GO | PAY_UP_FRONT
  environment?: string;
  signedDate?: number;
  appAccountToken?: string;
};

export type AppleRenewalPayload = {
  autoRenewStatus?: number; // 1 on, 0 off
  gracePeriodExpiresDate?: number;
  isInBillingRetryPeriod?: boolean;
  originalTransactionId?: string;
  environment?: string;
  signedDate?: number;
};

export type AppleNotificationPayload = {
  notificationType: string;
  subtype?: string;
  notificationUUID: string;
  signedDate?: number;
  data?: {
    environment?: string;
    bundleId?: string;
    signedTransactionInfo?: string;
    signedRenewalInfo?: string;
    status?: number;
  };
};

export class AppleValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppleValidationError';
  }
}

export type AppleVerifyContext = {
  verifyOptions?: VerifyAppleJwsOptions;
  nowMs?: number;
};

export function appleBundleId(env: Pick<Env, 'APPLE_BUNDLE_ID'>): string {
  return env.APPLE_BUNDLE_ID?.trim() || DEFAULT_APPLE_BUNDLE_ID;
}

/** Environments we accept. Default both: App Review + TestFlight purchases are Sandbox on the production API. */
export function allowedAppleEnvironments(
  env: Pick<Env, 'APPLE_ALLOWED_ENVIRONMENTS'>,
): Set<AppleEnvironment> {
  const raw = env.APPLE_ALLOWED_ENVIRONMENTS?.trim();
  const items = (raw ? raw.split(',') : ['Production', 'Sandbox'])
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const out = new Set<AppleEnvironment>();
  if (items.includes('production')) out.add('Production');
  if (items.includes('sandbox')) out.add('Sandbox');
  return out;
}

function checkEnvironment(
  env: Pick<Env, 'APPLE_ALLOWED_ENVIRONMENTS'>,
  value: string | undefined,
): AppleEnvironment {
  if (value !== 'Production' && value !== 'Sandbox') {
    throw new AppleValidationError(`Unsupported App Store environment: ${value ?? 'missing'}`);
  }
  if (!allowedAppleEnvironments(env).has(value)) {
    throw new AppleValidationError(`${value} purchases are not accepted by this server`);
  }
  return value;
}

async function verifyJws<T>(jws: string, ctx: AppleVerifyContext): Promise<T> {
  try {
    return await verifyAppleJws<T>(jws, { nowMs: ctx.nowMs, ...ctx.verifyOptions });
  } catch (e) {
    if (e instanceof AppleJwsError) {
      throw new AppleValidationError(`Invalid Apple signature: ${e.message}`);
    }
    throw e;
  }
}

type ValidatedTransaction = {
  tx: AppleTransactionPayload;
  billingPeriod: BillingPeriod;
  environment: AppleEnvironment;
};

/** Verify a signed transaction (JWS) and validate bundle id, product, type and environment. */
export async function verifyAppleTransaction(
  env: Env,
  jws: string,
  ctx: AppleVerifyContext = {},
): Promise<ValidatedTransaction> {
  const tx = await verifyJws<AppleTransactionPayload>(jws, ctx);
  return validateTransactionPayload(env, tx);
}

export function validateTransactionPayload(
  env: Env,
  tx: AppleTransactionPayload,
): ValidatedTransaction {
  if (tx.bundleId !== appleBundleId(env)) {
    throw new AppleValidationError('Transaction bundleId does not match this app');
  }
  const billingPeriod = APPLE_PRODUCTS[tx.productId];
  if (!billingPeriod) throw new AppleValidationError('Unknown subscription product');
  if (tx.type && tx.type !== 'Auto-Renewable Subscription') {
    throw new AppleValidationError('Transaction is not an auto-renewable subscription');
  }
  if (!tx.originalTransactionId || !tx.transactionId) {
    throw new AppleValidationError('Transaction ids missing');
  }
  if (typeof tx.expiresDate !== 'number') {
    throw new AppleValidationError('Transaction has no expiry (not a subscription)');
  }
  const environment = checkEnvironment(env, tx.environment);
  return { tx, billingPeriod, environment };
}

export type DerivedAppleStatus = {
  status: 'active' | 'trialing' | 'expired' | 'revoked';
  expiresAt: number | null;
  trialEnd: number | null;
};

/** Status of a transaction at `nowMs`, purely from the signed transaction fields. */
export function deriveAppleStatus(tx: AppleTransactionPayload, nowMs: number): DerivedAppleStatus {
  const expiresAt = typeof tx.expiresDate === 'number' ? Math.floor(tx.expiresDate / 1000) : null;
  if (tx.revocationDate) return { status: 'revoked', expiresAt, trialEnd: null };
  if (tx.expiresDate == null || tx.expiresDate <= nowMs) {
    return { status: 'expired', expiresAt, trialEnd: null };
  }
  const isFreeTrial =
    tx.offerType === 1 && (tx.offerDiscountType == null || tx.offerDiscountType === 'FREE_TRIAL');
  return isFreeTrial
    ? { status: 'trialing', expiresAt, trialEnd: expiresAt }
    : { status: 'active', expiresAt, trialEnd: null };
}

export type ApplyResult = { row: AppleSubscriptionRow; applied: boolean };

/**
 * Client path: link a verified signed transaction to `userId` and store its current state.
 * Payloads older than the stored state (by Apple's signedDate) are acknowledged but not applied,
 * so a replayed old transaction can never undo a newer refund/expiry.
 */
export async function applyClientTransaction(
  env: Env,
  userId: string,
  jws: string,
  ctx: AppleVerifyContext = {},
): Promise<ApplyResult> {
  const nowMs = ctx.nowMs ?? Date.now();
  const { tx, billingPeriod, environment } = await verifyAppleTransaction(env, jws, ctx);
  const derived = deriveAppleStatus(tx, nowMs);
  const existing = await getAppleSubscription(env.DB, tx.originalTransactionId);

  return upsertAppleSubscription(env.DB, {
    originalTransactionId: tx.originalTransactionId,
    userId,
    productId: tx.productId,
    billingPeriod,
    status: derived.status,
    environment,
    latestTransactionId: tx.transactionId,
    purchaseAt: tx.purchaseDate ? Math.floor(tx.purchaseDate / 1000) : null,
    expiresAt: derived.expiresAt,
    trialEnd: derived.trialEnd,
    autoRenew: existing ? null : true,
    revokedAt: tx.revocationDate ? Math.floor(tx.revocationDate / 1000) : null,
    signedAtMs: tx.signedDate ?? nowMs,
    notificationType: existing?.last_notification_type ?? null,
  });
}

export type NotificationOutcome =
  | { kind: 'ignored'; reason: string }
  | { kind: 'duplicate' }
  | { kind: 'unknown_subscription' }
  | { kind: 'applied'; status: string; userId: string };

const REFUND_TYPES = new Set(['REFUND', 'REVOKE']);
const EXPIRE_TYPES = new Set(['EXPIRED', 'GRACE_PERIOD_EXPIRED']);
const STATE_TYPES = new Set([
  'SUBSCRIBED',
  'DID_RENEW',
  'OFFER_REDEEMED',
  'DID_CHANGE_RENEWAL_PREF',
  'DID_CHANGE_RENEWAL_STATUS',
  'RENEWAL_EXTENDED',
  'REFUND_REVERSED',
  'PRICE_INCREASE',
]);

/** App Store Server Notifications V2: verify signedPayload, then update the matching subscription row. */
export async function handleAppleNotification(
  env: Env,
  signedPayload: string,
  ctx: AppleVerifyContext = {},
): Promise<NotificationOutcome> {
  const nowMs = ctx.nowMs ?? Date.now();
  const note = await verifyJws<AppleNotificationPayload>(signedPayload, ctx);
  if (!note.notificationUUID || !note.notificationType) {
    throw new AppleValidationError('Malformed notification');
  }
  const type = note.notificationType;
  const subtype = note.subtype ?? null;

  if (await wasAppleNotificationProcessed(env.DB, note.notificationUUID)) {
    return { kind: 'duplicate' };
  }

  const data = note.data;
  if (!data?.signedTransactionInfo) {
    // TEST, or notifications without transaction info.
    await markAppleNotificationProcessed(env.DB, note.notificationUUID, type, subtype);
    return { kind: 'ignored', reason: `no transaction info for ${type}` };
  }
  if (data.bundleId && data.bundleId !== appleBundleId(env)) {
    throw new AppleValidationError('Notification bundleId does not match this app');
  }
  checkEnvironment(env, data.environment);

  const { tx, billingPeriod, environment } = await verifyAppleTransaction(
    env,
    data.signedTransactionInfo,
    ctx,
  );
  let renewal: AppleRenewalPayload | null = null;
  if (data.signedRenewalInfo) {
    renewal = await verifyJws<AppleRenewalPayload>(data.signedRenewalInfo, ctx);
  }

  const existing = await getAppleSubscription(env.DB, tx.originalTransactionId);
  if (!existing) {
    // Apple retries only on non-2xx. Unknown subscriptions are linked later by the client's own
    // sync call (its signed transaction carries the latest state), so acknowledge and move on.
    await markAppleNotificationProcessed(env.DB, note.notificationUUID, type, subtype);
    return { kind: 'unknown_subscription' };
  }

  const derived = deriveAppleStatus(tx, nowMs);
  let expiresAt = derived.expiresAt;
  let status: string = derived.status;

  if (REFUND_TYPES.has(type)) {
    status = 'revoked';
  } else if (EXPIRE_TYPES.has(type)) {
    status = 'expired';
  } else if (type === 'DID_FAIL_TO_RENEW') {
    const graceEnd = renewal?.gracePeriodExpiresDate;
    if (derived.status !== 'revoked') {
      if (subtype === 'GRACE_PERIOD' && graceEnd && graceEnd > nowMs) {
        status = 'past_due'; // still entitled during Apple's billing grace period
        expiresAt = Math.floor(graceEnd / 1000);
      } else {
        status = 'expired'; // billing retry without grace: access ends with the paid period
      }
    }
  } else if (!STATE_TYPES.has(type)) {
    await markAppleNotificationProcessed(env.DB, note.notificationUUID, type, subtype);
    return { kind: 'ignored', reason: `unhandled type ${type}` };
  }

  const autoRenew =
    renewal?.autoRenewStatus === 1 ? true : renewal?.autoRenewStatus === 0 ? false : null;
  const signedAtMs = note.signedDate ?? tx.signedDate ?? nowMs;

  const { row } = await upsertAppleSubscription(env.DB, {
    originalTransactionId: tx.originalTransactionId,
    // Notifications never move a subscription between accounts.
    userId: existing.user_id,
    productId: tx.productId,
    billingPeriod,
    status,
    environment,
    latestTransactionId: tx.transactionId,
    purchaseAt: tx.purchaseDate ? Math.floor(tx.purchaseDate / 1000) : null,
    expiresAt,
    trialEnd: status === 'trialing' ? derived.trialEnd : null,
    autoRenew,
    revokedAt: tx.revocationDate ? Math.floor(tx.revocationDate / 1000) : null,
    signedAtMs,
    notificationType: subtype ? `${type}:${subtype}` : type,
  });
  await markAppleNotificationProcessed(env.DB, note.notificationUUID, type, subtype);
  return { kind: 'applied', status: row.status, userId: row.user_id };
}
