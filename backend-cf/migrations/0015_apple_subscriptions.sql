-- Apple App Store (StoreKit 2) subscription entitlement + App Store Server Notifications V2 idempotency.
-- One row per Apple originalTransactionId (the stable id of a subscription across renewals).
-- Entitlement is merged with the Stripe `subscriptions` row in resolveEntitlement(): a user is Pro if
-- either source is entitled, so web (Stripe) and iOS (Apple) Pro share the same plan, limits and quota.

CREATE TABLE IF NOT EXISTS apple_subscriptions (
  original_transaction_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  billing_period TEXT NOT NULL,
  -- active | trialing | past_due (billing grace) | expired | revoked (refund/revoke)
  status TEXT NOT NULL,
  environment TEXT NOT NULL,            -- Sandbox | Production
  latest_transaction_id TEXT,
  purchase_at INTEGER,                  -- unix seconds
  expires_at INTEGER,                   -- unix seconds (Apple expiresDate / 1000)
  trial_end INTEGER,                    -- unix seconds, set while in an introductory free trial
  auto_renew INTEGER NOT NULL DEFAULT 1,
  revoked_at INTEGER,
  last_signed_at INTEGER NOT NULL DEFAULT 0, -- ms; ignore older (out-of-order) updates
  last_notification_type TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_apple_subscriptions_user
  ON apple_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS apple_notification_events (
  notification_uuid TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  subtype TEXT,
  processed_at INTEGER NOT NULL
);
