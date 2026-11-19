import { nowUnixSeconds } from '../lib/time';
import { selectInChunks, type PageParams } from './sql-utils';

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
  page?: PageParams | null,
): Promise<RecipeRow[]> {
  const q = query?.trim();
  // Optional paging keeps a stable order via an id tie-breaker; unpaged SQL is unchanged.
  const tail = page ? ' ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?' : ' ORDER BY created_at ASC';
  const sql = q
    ? `SELECT * FROM recipes
       WHERE user_id = ? AND LOWER(meal_name) LIKE LOWER(?)${tail}`
    : `SELECT * FROM recipes WHERE user_id = ?${tail}`;
  const binds: unknown[] = q ? [userId, `%${q}%`] : [userId];
  if (page) binds.push(page.limit, page.offset);
  const result = await db.prepare(sql).bind(...binds).all<RecipeRow>();
  return result.results ?? [];
}

export async function countRecipes(
  db: D1Database,
  userId: string,
): Promise<number> {
  const row = await db
    .prepare(`SELECT COUNT(*) AS n FROM recipes WHERE user_id = ?`)
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
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

function buildIngredientRows(
  recipeId: string,
  ingredients: RecipeIngredientInput[],
): RecipeIngredientRow[] {
  return ingredients.map((ing, i) => ({
    id: crypto.randomUUID(),
    recipe_id: recipeId,
    name: ing.name,
    quantity: String(ing.quantity),
    unit: ing.unit,
    ingredient_id: ing.ingredient_id ?? null,
    sort_order: i,
  }));
}

function insertIngredientStatements(
  db: D1Database,
  rows: RecipeIngredientRow[],
): D1PreparedStatement[] {
  return rows.map((r) =>
    db
      .prepare(
        `INSERT INTO recipe_ingredients
          (id, recipe_id, name, quantity, unit, ingredient_id, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(r.id, r.recipe_id, r.name, r.quantity, r.unit, r.ingredient_id, r.sort_order),
  );
}

/** One grouped query (chunked IN) instead of one query per recipe. Ordered by sort_order. */
export async function listIngredientRowsForRecipes(
  db: D1Database,
  recipeIds: string[],
): Promise<Map<string, RecipeIngredientRow[]>> {
  const rows = await selectInChunks<RecipeIngredientRow>(
    db,
    recipeIds,
    (ph) =>
      `SELECT * FROM recipe_ingredients WHERE recipe_id IN (${ph}) ORDER BY sort_order ASC`,
  );
  const grouped = new Map<string, RecipeIngredientRow[]>();
  for (const row of rows) {
    const list = grouped.get(row.recipe_id);
    if (list) list.push(row);
    else grouped.set(row.recipe_id, [row]);
  }
  return grouped;
}

export async function createRecipe(
  db: D1Database,
  userId: string,
  input: RecipeInput,
): Promise<RecipeDto> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  const row: RecipeRow = {
    id,
    user_id: userId,
    folder_id: input.folder_id ?? null,
    meal_name: input.meal_name,
    instructions: instructionsToText(input.instructions),
    image_url: input.image_url ?? null,
    image_public_id: input.image_public_id ?? null,
    created_at: now,
    updated_at: now,
  };
  const ingredientRows = buildIngredientRows(id, input.ingredients ?? []);

  // One atomic batch: recipe row + every ingredient.
  await db.batch([
    db
      .prepare(
        `INSERT INTO recipes
          (id, user_id, folder_id, meal_name, instructions, image_url, image_public_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        row.id,
        row.user_id,
        row.folder_id,
        row.meal_name,
        row.instructions,
        row.image_url,
        row.image_public_id,
        now,
        now,
      ),
    ...insertIngredientStatements(db, ingredientRows),
  ]);

  return toRecipeDto(row, ingredientRows);
}

export async function updateRecipe(
  db: D1Database,
  userId: string,
  id: string,
  patch: RecipePatch,
): Promise<RecipeDto | null> {
  const existing = await getRecipe(db, userId, id);
  if (!existing) return null;

  const row: RecipeRow = {
    ...existing,
    meal_name: patch.meal_name ?? existing.meal_name,
    folder_id:
      patch.folder_id !== undefined ? (patch.folder_id ?? null) : existing.folder_id,
    instructions:
      patch.instructions !== undefined
        ? instructionsToText(patch.instructions)
        : existing.instructions,
    image_url: patch.image_url !== undefined ? patch.image_url : existing.image_url,
    image_public_id:
      patch.image_public_id !== undefined ? patch.image_public_id : existing.image_public_id,
    updated_at: nowUnixSeconds(),
  };

  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `UPDATE recipes
         SET folder_id = ?, meal_name = ?, instructions = ?,
             image_url = ?, image_public_id = ?, updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        row.folder_id,
        row.meal_name,
        row.instructions,
        row.image_url,
        row.image_public_id,
        row.updated_at,
        id,
        userId,
      ),
  ];

  let ingredientRows: RecipeIngredientRow[];
  if (patch.ingredients !== undefined) {
    ingredientRows = buildIngredientRows(id, patch.ingredients);
    // DELETE + inserts in the same batch (atomic: never leaves a recipe without ingredients).
    statements.push(
      db.prepare(`DELETE FROM recipe_ingredients WHERE recipe_id = ?`).bind(id),
      ...insertIngredientStatements(db, ingredientRows),
    );
    await db.batch(statements);
  } else {
    await db.batch(statements);
    ingredientRows = await listRecipeIngredientRows(db, id);
  }

  return toRecipeDto(row, ingredientRows);
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
