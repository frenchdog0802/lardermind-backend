-- Guest / first-win ephemeral users
ALTER TABLE users ADD COLUMN is_guest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN expires_at INTEGER;

CREATE TABLE IF NOT EXISTS guest_rate_limits (
  id TEXT PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  bucket_day TEXT NOT NULL,
  mint_count INTEGER NOT NULL DEFAULT 0,
  chat_count INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_guest_rate_ip_day
  ON guest_rate_limits(ip_hash, bucket_day);

CREATE INDEX IF NOT EXISTS idx_users_guest_expires
  ON users(is_guest, expires_at);
