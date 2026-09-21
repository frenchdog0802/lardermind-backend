import { nowUnixSeconds } from '../lib/time';
import {
  findByIngredientId,
  findByNameCi,
  updatePantryItem,
  type PantryItemRow,
} from './pantry';
import {
  getRecipe,
  listRecipeIngredientRows,
  type RecipeIngredientRow,
} from './recipe';

export type MealPlanRow = {
  id: string;
  user_id: string;
  meal_type: string;
  serving_date: string;
  recipe_id: string | null;
  meal_name: string;
  image: string | null;
  status: string;
  created_at: number | null;
  updated_at: number | null;
};

export type MealPlanDto = {
  id: string;
  meal_type: string;
  serving_date: string;
  recipe_id: string;
  meal_name: string;
  image?: string | null;
  status?: string;
};

export type MealPlanInput = {
  meal_type: string;
  serving_date: string;
  recipe_id?: string;
  meal_name?: string;
  image?: string | null;
  status?: string;
};

export type MealPlanPatch = Partial<MealPlanInput>;

export type MealConfirmShortage = {
  ingredient_id?: string;
  name: string;
  needed: number;
  available: number;
  unit: string;
};

export type MealConfirmDeducted = {
  ingredient_id?: string;
  name: string;
  deducted: number;
  previous_quantity: number;
  new_quantity: number;
  unit: string;
};

export type ConfirmMealPlanResult = {
  mealPlan: MealPlanDto;
  shortages: MealConfirmShortage[];
  deducted: MealConfirmDeducted[];
  alreadyConfirmed: boolean;
};

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function toMealPlanDto(row: MealPlanRow): MealPlanDto {
  return {
    id: row.id,
    meal_type: row.meal_type,
    serving_date: row.serving_date,
    recipe_id: row.recipe_id ?? '',
    meal_name: row.meal_name,
    image: row.image,
    status: row.status,
  };
}

export async function listMealPlans(
  db: D1Database,
  userId: string,
  query?: string,
): Promise<MealPlanRow[]> {
  const sql = query?.trim()
    ? `SELECT * FROM meal_plans
       WHERE user_id = ? AND LOWER(meal_name) LIKE LOWER(?)
       ORDER BY serving_date ASC, created_at ASC`
    : `SELECT * FROM meal_plans
       WHERE user_id = ? ORDER BY serving_date ASC, created_at ASC`;
  const stmt = db.prepare(sql);
  const result = query?.trim()
    ? await stmt.bind(userId, `%${query.trim()}%`).all<MealPlanRow>()
    : await stmt.bind(userId).all<MealPlanRow>();
  return result.results ?? [];
}

export async function listPendingConfirmMealPlans(
  db: D1Database,
  userId: string,
): Promise<MealPlanRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM meal_plans
       WHERE user_id = ? AND status IN ('PLANNED', 'PENDING_CONFIRM')
       ORDER BY serving_date ASC, created_at ASC`,
    )
    .bind(userId)
    .all<MealPlanRow>();
  return result.results ?? [];
}

export async function getMealPlan(
  db: D1Database,
  userId: string,
  id: string,
): Promise<MealPlanRow | null> {
  return db
    .prepare(`SELECT * FROM meal_plans WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId)
    .first<MealPlanRow>();
}

export async function createMealPlan(
  db: D1Database,
  userId: string,
  input: MealPlanInput,
): Promise<MealPlanRow> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT INTO meal_plans
        (id, user_id, meal_type, serving_date, recipe_id, meal_name, image, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.meal_type,
      input.serving_date,
      input.recipe_id ?? null,
      input.meal_name ?? '',
      input.image ?? null,
      input.status ?? 'PLANNED',
      now,
      now,
    )
    .run();

  const row = await getMealPlan(db, userId, id);
  if (!row) throw new Error('Failed to load created meal plan');
  return row;
}

export async function updateMealPlan(
  db: D1Database,
  userId: string,
  id: string,
  patch: MealPlanPatch,
): Promise<MealPlanRow | null> {
  const existing = await getMealPlan(db, userId, id);
  if (!existing) return null;

  const mealType = patch.meal_type ?? existing.meal_type;
  const servingDate = patch.serving_date ?? existing.serving_date;
  const recipeId =
    patch.recipe_id !== undefined
      ? (patch.recipe_id ?? null)
      : existing.recipe_id;
  const mealName =
    patch.meal_name !== undefined ? patch.meal_name : existing.meal_name;
  const image = patch.image !== undefined ? patch.image : existing.image;
  const status = patch.status !== undefined ? patch.status : existing.status;
  const now = nowUnixSeconds();

  await db
    .prepare(
      `UPDATE meal_plans
       SET meal_type = ?, serving_date = ?, recipe_id = ?, meal_name = ?,
           image = ?, status = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      mealType,
      servingDate,
      recipeId,
      mealName,
      image,
      status,
      now,
      id,
      userId,
    )
    .run();

  return getMealPlan(db, userId, id);
}

export async function deleteMealPlan(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM meal_plans WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

async function findPantryForIngredient(
  db: D1Database,
  userId: string,
  ing: RecipeIngredientRow,
): Promise<PantryItemRow | null> {
  if (ing.ingredient_id) {
    const byId = await findByIngredientId(db, userId, ing.ingredient_id);
    if (byId) return byId;
  }
  return findByNameCi(db, userId, ing.name);
}

export async function confirmMealPlan(
  db: D1Database,
  userId: string,
  id: string,
): Promise<ConfirmMealPlanResult | null> {
  const plan = await getMealPlan(db, userId, id);
  if (!plan) return null;

  if (plan.status === 'CONFIRMED') {
    return {
      mealPlan: toMealPlanDto(plan),
      shortages: [],
      deducted: [],
      alreadyConfirmed: true,
    };
  }

  const shortages: MealConfirmShortage[] = [];
  const deducted: MealConfirmDeducted[] = [];

  if (plan.recipe_id) {
    const recipe = await getRecipe(db, userId, plan.recipe_id);
    if (recipe) {
      const ingredients = await listRecipeIngredientRows(db, plan.recipe_id);
      for (const ing of ingredients) {
        const needed = quantityFromRow(ing.quantity);
        const unit = ing.unit ?? 'pcs';
        const pantry = await findPantryForIngredient(db, userId, ing);

        if (!pantry) {
          shortages.push({
            ...(ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {}),
            name: ing.name,
            needed,
            available: 0,
            unit,
          });
          continue;
        }

        const available = quantityFromRow(pantry.quantity);
        const deductQty = Math.min(available, needed);
        const newQty = available - deductQty;

        await updatePantryItem(db, userId, pantry.id, { quantity: newQty });

        if (deductQty > 0) {
          deducted.push({
            ...(ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {}),
            name: ing.name,
            deducted: deductQty,
            previous_quantity: available,
            new_quantity: newQty,
            unit: pantry.unit ?? unit,
          });
        }

        if (deductQty < needed) {
          shortages.push({
            ...(ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {}),
            name: ing.name,
            needed,
            available,
            unit: pantry.unit ?? unit,
          });
        }
      }
    }
  }

  const updated = await updateMealPlan(db, userId, id, { status: 'CONFIRMED' });
  if (!updated) return null;

  return {
    mealPlan: toMealPlanDto(updated),
    shortages,
    deducted,
    alreadyConfirmed: false,
  };
}

export async function skipMealPlan(
  db: D1Database,
  userId: string,
  id: string,
): Promise<{ mealPlan: MealPlanDto; alreadySkipped: boolean } | null> {
  const plan = await getMealPlan(db, userId, id);
  if (!plan) return null;

  if (plan.status === 'SKIPPED') {
    return { mealPlan: toMealPlanDto(plan), alreadySkipped: true };
  }

  const updated = await updateMealPlan(db, userId, id, { status: 'SKIPPED' });
  if (!updated) return null;

  return { mealPlan: toMealPlanDto(updated), alreadySkipped: false };
}
