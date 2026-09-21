ALTER TABLE chat_sessions ADD COLUMN locked_at INTEGER;
ALTER TABLE chat_sessions ADD COLUMN pending_interrupt_json TEXT;
