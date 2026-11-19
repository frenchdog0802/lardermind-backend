-- Additive, idempotent indexes for launch hardening. Safe for the previous Worker.
-- Date-window queries on the meal calendar (GET /api/meal-plan?from&to, availability).
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_serving_date
  ON meal_plans(user_id, serving_date);

-- Recipes by folder (folder browse / folder delete checks).
CREATE INDEX IF NOT EXISTS idx_recipes_folder
  ON recipes(folder_id);

-- Case-insensitive name lookups (findByNameCi, shopping merge-add, sync prefetch). Queries use
-- `name = ? COLLATE NOCASE` / `name COLLATE NOCASE IN (...)` so these indexes apply.
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_name_nocase
  ON pantry_items(user_id, name COLLATE NOCASE);

CREATE INDEX IF NOT EXISTS idx_shopping_list_user_name_nocase
  ON shopping_list_items(user_id, name COLLATE NOCASE);
