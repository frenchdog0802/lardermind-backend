-- Prefer treating household staples as available for cookable suggestions.
ALTER TABLE user_preferences
  ADD COLUMN assume_basic_seasonings INTEGER NOT NULL DEFAULT 1;
