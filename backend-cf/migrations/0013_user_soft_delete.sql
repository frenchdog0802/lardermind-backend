-- Account deletion (App Store 5.1.1(v)): soft delete. Rows are kept; the email / google_id are
-- freed (rewritten to placeholders) so the person can sign up again. Originals are kept here.
-- Apply BEFORE deploying the Worker that reads users.deleted_at.
ALTER TABLE users ADD COLUMN deleted_at INTEGER;
ALTER TABLE users ADD COLUMN deleted_email TEXT;
ALTER TABLE users ADD COLUMN deleted_google_id TEXT;
