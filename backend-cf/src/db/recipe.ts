import { nowUnixSeconds } from '../lib/time';

export type RecipeRow = {
  id: string;
  user_id: string;
  folder_id: string | null;
  meal_name: string;
  instructions: string;
  image_url: string | null;
  image_public_id: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type RecipeIngredientRow = {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  ingredient_id: string | null;
  sort_order: number;
};

export type RecipeIngredientDto = {
  name: string;
  quantity: number;
  unit: string;
  ingredient_id?: string;
};

export type RecipeDto = {
  id: string;
  folder_id: string;
  meal_name: string;
  instructions: string[];
  ingredients: RecipeIngredientDto[];
  image: { url: string; public_id: string } | null;
};

export type RecipeIngredientInput = {
  name: string;
  quantity: number;
  unit: string;
  ingredient_id?: string;
};

export type RecipeInput = {
  meal_name: string;
  folder_id?: string;
  instructions: string | string[];
  ingredients: RecipeIngredientInput[];
  image_url?: string;
  image_public_id?: string;
};

export type RecipePatch = Partial<Omit<RecipeInput, 'ingredients'>> & {
  ingredients?: RecipeIngredientInput[];
};

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function instructionsToText(instructions: string | string[]): string {
  if (Array.isArray(instructions)) {
    return instructions.map((s) => s.trim()).filter(Boolean).join('\n');
  }
  return instructions ?? '';
}

export function instructionsFromText(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split('\n').map((s) => s.trim()).filter(Boolean);
}

function toIngredientDto(row: RecipeIngredientRow): RecipeIngredientDto {
  const dto: RecipeIngredientDto = {
    name: row.name,
    quantity: quantityFromRow(row.quantity),
    unit: row.unit ?? 'pcs',
  };
  if (row.ingredient_id) dto.ingredient_id = row.ingredient_id;
  return dto;
}

export function toRecipeDto(
  row: RecipeRow,
  ingredientRows: RecipeIngredientRow[],
): RecipeDto {
  const image =
    row.image_url && row.image_public_id
      ? { url: row.image_url, public_id: row.image_public_id }
      : row.image_url
        ? { url: row.image_url, public_id: '' }
        : null;

  return {
    id: row.id,
    folder_id: row.folder_id ?? '',
    meal_name: row.meal_name,
    instructions: instructionsFromText(row.instructions),
    ingredients: ingredientRows
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(toIngredientDto),
    image,
  };
}

export async function listRecipeIngredientRows(
  db: D1Database,
  recipeId: string,
): Promise<RecipeIngredientRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM recipe_ingredients WHERE recipe_id = ? ORDER BY sort_order ASC`,
    )
    .bind(recipeId)
    .all<RecipeIngredientRow>();
  return result.results ?? [];
}

export async function listRecipes(
  db: D1Database,
  userId: string,
  query?: string,
): Promise<RecipeRow[]> {
  const sql = query?.trim()
    ? `SELECT * FROM recipes
       WHERE user_id = ? AND LOWER(meal_name) LIKE LOWER(?)
       ORDER BY created_at ASC`
    : `SELECT * FROM recipes WHERE user_id = ? ORDER BY created_at ASC`;
  const stmt = db.prepare(sql);
  const result = query?.trim()
    ? await stmt.bind(userId, `%${query.trim()}%`).all<RecipeRow>()
    : await stmt.bind(userId).all<RecipeRow>();
  return result.results ?? [];
}

export async function getRecipe(
  db: D1Database,
  userId: string,
  id: string,
): Promise<RecipeRow | null> {
  return db
    .prepare(`SELECT * FROM recipes WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId)
    .first<RecipeRow>();
}

async function insertRecipeIngredients(
  db: D1Database,
  recipeId: string,
  ingredients: RecipeIngredientInput[],
): Promise<void> {
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i];
    await db
      .prepare(
        `INSERT INTO recipe_ingredients
          (id, recipe_id, name, quantity, unit, ingredient_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        recipeId,
        ing.name,
        String(ing.quantity),
        ing.unit,
        ing.ingredient_id ?? null,
        i,
      )
      .run();
  }
}

export async function createRecipe(
  db: D1Database,
  userId: string,
  input: RecipeInput,
): Promise<RecipeDto> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT INTO recipes
        (id, user_id, folder_id, meal_name, instructions, image_url, image_public_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.folder_id ?? null,
      input.meal_name,
      instructionsToText(input.instructions),
      input.image_url ?? null,
      input.image_public_id ?? null,
      now,
      now,
    )
    .run();

  await insertRecipeIngredients(db, id, input.ingredients ?? []);

  const row = await getRecipe(db, userId, id);
  if (!row) throw new Error('Failed to load created recipe');
  const ingredients = await listRecipeIngredientRows(db, id);
  return toRecipeDto(row, ingredients);
}

export async function updateRecipe(
  db: D1Database,
  userId: string,
  id: string,
  patch: RecipePatch,
): Promise<RecipeDto | null> {
  const existing = await getRecipe(db, userId, id);
  if (!existing) return null;

  const mealName = patch.meal_name ?? existing.meal_name;
  const folderId =
    patch.folder_id !== undefined
      ? (patch.folder_id ?? null)
      : existing.folder_id;
  const instructions =
    patch.instructions !== undefined
      ? instructionsToText(patch.instructions)
      : existing.instructions;
  const imageUrl =
    patch.image_url !== undefined ? patch.image_url : existing.image_url;
  const imagePublicId =
    patch.image_public_id !== undefined
      ? patch.image_public_id
      : existing.image_public_id;
  const now = nowUnixSeconds();

  await db
    .prepare(
      `UPDATE recipes
       SET folder_id = ?, meal_name = ?, instructions = ?,
           image_url = ?, image_public_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      folderId,
      mealName,
      instructions,
      imageUrl,
      imagePublicId,
      now,
      id,
      userId,
    )
    .run();

  if (patch.ingredients !== undefined) {
    await db
      .prepare(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`)
      .bind(id)
      .run();
    await insertRecipeIngredients(db, id, patch.ingredients);
  }

  const row = await getRecipe(db, userId, id);
  if (!row) return null;
  const ingredients = await listRecipeIngredientRows(db, id);
  return toRecipeDto(row, ingredients);
}

export async function deleteRecipe(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const existing = await getRecipe(db, userId, id);
  if (!existing) return false;

  await db
    .prepare(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`)
    .bind(id)
    .run();
  const result = await db
    .prepare(`DELETE FROM recipes WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function getRecipeDto(
  db: D1Database,
  userId: string,
  id: string,
): Promise<RecipeDto | null> {
  const row = await getRecipe(db, userId, id);
  if (!row) return null;
  const ingredients = await listRecipeIngredientRows(db, id);
  return toRecipeDto(row, ingredients);
}
