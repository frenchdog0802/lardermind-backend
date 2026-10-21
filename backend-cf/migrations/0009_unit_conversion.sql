-- Per-user unit conversion ratios (e.g. 1 包 排骨 = 500 g).
CREATE TABLE IF NOT EXISTS unit_conversion_table (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_name TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  target_unit TEXT NOT NULL,
  ratio REAL NOT NULL,
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE(user_id, item_name, base_unit, target_unit)
);

CREATE INDEX IF NOT EXISTS idx_unit_conversion_user
  ON unit_conversion_table(user_id);
