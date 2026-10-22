-- Additive hardening: auth rate limits, shopping versions, HITL claim, idempotency.
-- Safe for the previous Worker: new columns have defaults or are nullable; new tables are unused.

ALTER TABLE shopping_list_items ADD COLUMN version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE chat_sessions ADD COLUMN pending_claim_token TEXT;
ALTER TABLE chat_sessions ADD COLUMN hitl_checkpoint_json TEXT;

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  id TEXT PRIMARY KEY,
  subject_hash TEXT NOT NULL,
  bucket_start INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  UNIQUE (subject_hash, bucket_start)
);

CREATE TABLE IF NOT EXISTS idempotency_records (
  user_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  method TEXT NOT NULL,
  route_key TEXT NOT NULL,
  status INTEGER NOT NULL,
  response_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, idempotency_key)
);
