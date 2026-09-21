-- Optional catalog link for Nest-compatible PUT bulk upsert-by-ingredient.
ALTER TABLE pantry_items ADD COLUMN ingredient_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pantry_items_user_ingredient
  ON pantry_items(user_id, ingredient_id);
