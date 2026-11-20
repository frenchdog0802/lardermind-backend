import { nowUnixSeconds } from '../lib/time';
import { isEntitled } from '../lib/entitlement';

export type AppleSubscriptionRow = {
  original_transaction_id: string;
  user_id: string;
  product_id: string;
  billing_period: string;
  status: string;
  environment: string;
  latest_transaction_id: string | null;
  purchase_at: number | null;
  expires_at: number | null;
  trial_end: number | null;
  auto_renew: number;
  revoked_at: number | null;
  last_signed_at: number;
  last_notification_type: string | null;
  created_at: number;
  updated_at: number;
};

export type AppleSubscriptionInput = {
  originalTransactionId: string;
  userId: string;
  productId: string;
  billingPeriod: string;
  status: string;
  environment: string;
  latestTransactionId?: string | null;
  purchaseAt?: number | null;
  expiresAt?: number | null;
  trialEnd?: number | null;
  autoRenew?: boolean | null;
  revokedAt?: number | null;
  signedAtMs: number;
  notificationType?: string | null;
};

/** Apple rows are time-bound: a row whose period has ended never grants Pro, even if a notification was missed. */
export function isAppleRowEntitled(
  row: Pick<AppleSubscriptionRow, 'status' | 'expires_at'>,
  nowSeconds = nowUnixSeconds(),
): boolean {
  if (!isEntitled(row.status)) return false;
  return row.expires_at != null && row.expires_at > nowSeconds;
}

export async function getAppleSubscription(
  db: D1Database,
  originalTransactionId: string,
): Promise<AppleSubscriptionRow | null> {
  return db
    .prepare('SELECT * FROM apple_subscriptions WHERE original_transaction_id = ? LIMIT 1')
    .bind(originalTransactionId)
    .first<AppleSubscriptionRow>();
}

export async function listAppleSubscriptionsForUser(
  db: D1Database,
  userId: string,
): Promise<AppleSubscriptionRow[]> {
  const res = await db
    .prepare('SELECT * FROM apple_subscriptions WHERE user_id = ? ORDER BY expires_at DESC')
    .bind(userId)
    .all<AppleSubscriptionRow>();
  return res.results ?? [];
}

/** Best entitled row for a user (latest expiry), else the most recent row, else null. */
export function pickAppleRow(
  rows: AppleSubscriptionRow[],
  nowSeconds = nowUnixSeconds(),
): { row: AppleSubscriptionRow | null; entitled: boolean } {
  const entitled = rows
    .filter((r) => isAppleRowEntitled(r, nowSeconds))
    .sort((a, b) => (b.expires_at ?? 0) - (a.expires_at ?? 0))[0];
  if (entitled) return { row: entitled, entitled: true };
  return { row: rows[0] ?? null, entitled: false };
}

export class AppleLinkConflictError extends Error {
  constructor() {
    super('This Apple subscription is already linked to another LarderMind account');
    this.name = 'AppleLinkConflictError';
  }
}

/**
 * Insert/update the row for an originalTransactionId.
 *  - Updates older than `last_signed_at` are ignored (out-of-order notifications / stale client payloads).
 *  - An active subscription linked to a different user cannot be taken over (AppleLinkConflictError);
 *    once it is no longer entitled it may be re-linked (e.g. user restores on a new account).
 */
export async function upsertAppleSubscription(
  db: D1Database,
  input: AppleSubscriptionInput,
): Promise<{ row: AppleSubscriptionRow; applied: boolean }> {
  const now = nowUnixSeconds();
  const existing = await getAppleSubscription(db, input.originalTransactionId);

  if (existing && existing.user_id !== input.userId && isAppleRowEntitled(existing, now)) {
    throw new AppleLinkConflictError();
  }

  if (!existing) {
    await db
      .prepare(
        `INSERT INTO apple_subscriptions (
           original_transaction_id, user_id, product_id, billing_period, status, environment,
           latest_transaction_id, purchase_at, expires_at, trial_end, auto_renew, revoked_at,
           last_signed_at, last_notification_type, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        input.originalTransactionId,
        input.userId,
        input.productId,
        input.billingPeriod,
        input.status,
        input.environment,
        input.latestTransactionId ?? null,
        input.purchaseAt ?? null,
        input.expiresAt ?? null,
        input.trialEnd ?? null,
        input.autoRenew === false ? 0 : 1,
        input.revokedAt ?? null,
        input.signedAtMs,
        input.notificationType ?? null,
        now,
        now,
      )
      .run();
    const row = await getAppleSubscription(db, input.originalTransactionId);
    if (!row) throw new Error('Failed to create apple subscription row');
    return { row, applied: true };
  }

  if (input.signedAtMs < existing.last_signed_at) {
    return { row: existing, applied: false };
  }

  await db
    .prepare(
      `UPDATE apple_subscriptions SET
         user_id = ?, product_id = ?, billing_period = ?, status = ?, environment = ?,
         latest_transaction_id = ?, purchase_at = ?, expires_at = ?, trial_end = ?,
         auto_renew = ?, revoked_at = ?, last_signed_at = ?, last_notification_type = ?,
         updated_at = ?
       WHERE original_transaction_id = ?`,
    )
    .bind(
      input.userId,
      input.productId,
      input.billingPeriod,
      input.status,
      input.environment,
      input.latestTransactionId ?? existing.latest_transaction_id,
      input.purchaseAt ?? existing.purchase_at,
      input.expiresAt ?? existing.expires_at,
      input.trialEnd ?? null,
      input.autoRenew == null ? existing.auto_renew : input.autoRenew ? 1 : 0,
      input.revokedAt ?? (input.status === 'revoked' ? now : null),
      input.signedAtMs,
      input.notificationType ?? existing.last_notification_type,
      now,
      input.originalTransactionId,
    )
    .run();
  const row = await getAppleSubscription(db, input.originalTransactionId);
  if (!row) throw new Error('apple subscription row vanished');
  return { row, applied: true };
}

export async function wasAppleNotificationProcessed(
  db: D1Database,
  uuid: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT notification_uuid FROM apple_notification_events WHERE notification_uuid = ? LIMIT 1')
    .bind(uuid)
    .first<{ notification_uuid: string }>();
  return Boolean(row);
}

export async function markAppleNotificationProcessed(
  db: D1Database,
  uuid: string,
  type: string,
  subtype: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT OR IGNORE INTO apple_notification_events (notification_uuid, type, subtype, processed_at)
       VALUES (?, ?, ?, ?)`,
    )
    .bind(uuid, type, subtype, nowUnixSeconds())
    .run();
}
