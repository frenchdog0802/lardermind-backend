-- Sign in with Apple: stable Apple user id (`sub` of the identity token).
-- Apply BEFORE deploying the Worker that reads users.apple_id.
ALTER TABLE users ADD COLUMN apple_id TEXT;
ALTER TABLE users ADD COLUMN deleted_apple_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_apple_id ON users(apple_id) WHERE apple_id IS NOT NULL;
