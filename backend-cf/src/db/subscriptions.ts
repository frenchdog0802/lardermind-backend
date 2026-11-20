import { nowUnixSeconds } from '../lib/time';
import {
  isEntitled,
  planNameForBillingPeriod,
  type Entitlement,
} from '../lib/entitlement';
import type { BillingPeriod } from '../lib/stripe';
import { listAppleSubscriptionsForUser, pickAppleRow } from './apple-subscriptions';

export type SubscriptionRow = {
  user_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  stripe_price_id: string | null;
  status: string;
  cancel_at_period_end: number;
  current_period_start: number | null;
  current_period_end: number | null;
  trial_end: number | null;
  billing_period: string | null;
  source: string;
  created_at: number;
  updated_at: number;
};

export type SubscriptionUpsertInput = {
  userId: string;
  stripeCustomerId: string;
  stripeSubscriptionId?: string | null;
  stripePriceId?: string | null;
  status: string;
  cancelAtPeriodEnd?: boolean;
  currentPeriodStart?: number | null;
  currentPeriodEnd?: number | null;
  trialEnd?: number | null;
  billingPeriod?: BillingPeriod | string | null;
  source?: string;
};

export async function getSubscriptionByUserId(
  db: D1Database,
  userId: string,
): Promise<SubscriptionRow | null> {
  return db
    .prepare('SELECT * FROM subscriptions WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<SubscriptionRow>();
}

export async function getSubscriptionByCustomerId(
  db: D1Database,
  stripeCustomerId: string,
): Promise<SubscriptionRow | null> {
  return db
    .prepare('SELECT * FROM subscriptions WHERE stripe_customer_id = ? LIMIT 1')
    .bind(stripeCustomerId)
    .first<SubscriptionRow>();
}

export async function getSubscriptionByStripeSubscriptionId(
  db: D1Database,
  stripeSubscriptionId: string,
): Promise<SubscriptionRow | null> {
  return db
    .prepare('SELECT * FROM subscriptions WHERE stripe_subscription_id = ? LIMIT 1')
    .bind(stripeSubscriptionId)
    .first<SubscriptionRow>();
}

export async function hasHadStripeSubscription(
  db: D1Database,
  userId: string,
): Promise<boolean> {
  const row = await getSubscriptionByUserId(db, userId);
  return Boolean(row?.stripe_subscription_id);
}

export async function ensureCustomerRow(
  db: D1Database,
  userId: string,
  stripeCustomerId: string,
): Promise<SubscriptionRow> {
  const existing = await getSubscriptionByUserId(db, userId);
  const now = nowUnixSeconds();
  if (existing) {
    if (existing.stripe_customer_id !== stripeCustomerId) {
      await db
        .prepare(
          `UPDATE subscriptions
           SET stripe_customer_id = ?, updated_at = ?
           WHERE user_id = ?`,
        )
        .bind(stripeCustomerId, now, userId)
        .run();
      return { ...existing, stripe_customer_id: stripeCustomerId, updated_at: now };
    }
    return existing;
  }

  await db
    .prepare(
      `INSERT INTO subscriptions (
         user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
         status, cancel_at_period_end, current_period_start, current_period_end,
         trial_end, billing_period, source, created_at, updated_at
       ) VALUES (?, ?, NULL, NULL, 'none', 0, NULL, NULL, NULL, NULL, 'stripe', ?, ?)`,
    )
    .bind(userId, stripeCustomerId, now, now)
    .run();

  const row = await getSubscriptionByUserId(db, userId);
  if (!row) throw new Error('Failed to create subscription row');
  return row;
}

export async function upsertSubscriptionFromStripe(
  db: D1Database,
  input: SubscriptionUpsertInput,
): Promise<void> {
  const now = nowUnixSeconds();
  const existing = await getSubscriptionByUserId(db, input.userId);
  const cancelAtPeriodEnd = input.cancelAtPeriodEnd ? 1 : 0;
  const source = input.source ?? 'stripe';

  if (existing) {
    await db
      .prepare(
        `UPDATE subscriptions SET
           stripe_customer_id = ?,
           stripe_subscription_id = ?,
           stripe_price_id = ?,
           status = ?,
           cancel_at_period_end = ?,
           current_period_start = ?,
           current_period_end = ?,
           trial_end = ?,
           billing_period = ?,
           source = ?,
           updated_at = ?
         WHERE user_id = ?`,
      )
      .bind(
        input.stripeCustomerId,
        input.stripeSubscriptionId ?? existing.stripe_subscription_id,
        input.stripePriceId ?? existing.stripe_price_id,
        input.status,
        cancelAtPeriodEnd,
        input.currentPeriodStart ?? existing.current_period_start,
        input.currentPeriodEnd ?? existing.current_period_end,
        input.trialEnd ?? existing.trial_end,
        input.billingPeriod ?? existing.billing_period,
        source,
        now,
        input.userId,
      )
      .run();
    return;
  }

  await db
    .prepare(
      `INSERT INTO subscriptions (
         user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id,
         status, cancel_at_period_end, current_period_start, current_period_end,
         trial_end, billing_period, source, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      input.userId,
      input.stripeCustomerId,
      input.stripeSubscriptionId ?? null,
      input.stripePriceId ?? null,
      input.status,
      cancelAtPeriodEnd,
      input.currentPeriodStart ?? null,
      input.currentPeriodEnd ?? null,
      input.trialEnd ?? null,
      input.billingPeriod ?? null,
      source,
      now,
      now,
    )
    .run();
}

export async function resolveEntitlement(
  db: D1Database,
  userId: string,
  role?: string | null,
): Promise<Entitlement> {
  const isAdmin = role === 'admin';
  const row = await getSubscriptionByUserId(db, userId);
  const stripeStatus = row?.status ?? 'none';
  const stripeEntitled = isEntitled(stripeStatus);

  // Web (Stripe) and iOS (App Store) Pro are the same plan: Pro if either source is entitled.
  const apple = pickAppleRow(await listAppleSubscriptionsForUser(db, userId));
  const useApple = !stripeEntitled && apple.entitled && apple.row != null;
  const a = apple.row;

  const status = useApple ? a!.status : stripeStatus;
  const entitled = stripeEntitled || useApple;
  const billingPeriod = useApple ? a!.billing_period : (row?.billing_period ?? null);

  return {
    isPro: isAdmin || entitled,
    isTrial: status === 'trialing',
    isAdmin,
    status,
    trialEndsAt: useApple ? (a!.trial_end ?? null) : (row?.trial_end ?? null),
    expiresAt: useApple ? (a!.expires_at ?? null) : (row?.current_period_end ?? null),
    planName: entitled ? planNameForBillingPeriod(billingPeriod) : null,
    billingPeriod,
    stripeCustomerId: row?.stripe_customer_id ?? null,
    stripeSubscriptionId: row?.stripe_subscription_id ?? null,
    hasHadSubscription: Boolean(row?.stripe_subscription_id) || a != null,
    source: stripeEntitled ? 'stripe' : useApple ? 'apple' : null,
    appleOriginalTransactionId: a?.original_transaction_id ?? null,
  };
}

export async function wasWebhookEventProcessed(
  db: D1Database,
  eventId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT event_id FROM stripe_webhook_events WHERE event_id = ? LIMIT 1')
    .bind(eventId)
    .first<{ event_id: string }>();
  return Boolean(row);
}

export async function markWebhookEventProcessed(
  db: D1Database,
  eventId: string,
  type: string,
): Promise<void> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT OR IGNORE INTO stripe_webhook_events (event_id, type, processed_at)
       VALUES (?, ?, ?)`,
    )
    .bind(eventId, type, now)
    .run();
}
