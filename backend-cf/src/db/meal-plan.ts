import { nowUnixSeconds } from '../lib/time';
import {
  deletePantryItem,
  findByIngredientId,
  findPantryByNameLoose,
  listPantryItems,
  updatePantryItem,
  type PantryItemRow,
} from './pantry';
import {
  getRecipe,
  listRecipeIngredientRows,
  listRecipes,
  type RecipeIngredientRow,
  type RecipeRow,
} from './recipe';
import {
  canonicalUnit,
  convertQtyBetweenItems,
  ingredientNameKey,
} from './units';

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
  /** Present when pantry matched by name/id but units differ — no silent convert. */
  reason?: 'unit_mismatch';
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

export type MealAvailabilityStatus = 'ok' | 'short' | 'unknown';

export type MealAvailabilityEntry = {
  meal_plan_id: string;
  serving_date: string;
  meal_name: string;
  meal_type: string;
  recipe_id: string | null;
  status: MealAvailabilityStatus;
  shortages: MealConfirmShortage[];
};

function mealAvailabilityEntry(
  plan: MealPlanRow,
  status: MealAvailabilityStatus,
  shortages: MealConfirmShortage[],
): MealAvailabilityEntry {
  return {
    meal_plan_id: plan.id,
    serving_date: plan.serving_date,
    meal_name: plan.meal_name,
    meal_type: plan.meal_type,
    recipe_id: plan.recipe_id,
    status,
    shortages,
  };
}

export type WeekAvailabilityResult = {
  meals: MealAvailabilityEntry[];
  weekShortages: MealConfirmShortage[];
};

/** Mutable pantry quantity used for week preview (never written to DB). */
export type PantryPoolEntry = {
  name: string;
  ingredient_id?: string;
  pantry_item_id?: string;
  quantity: number;
  unit: string;
  /** Other pantry rows sharing the same name key (e.g. milk in ml and in l). */
  siblings?: PantryPoolEntry[];
};

/** Soft-reserve view: on-hand unchanged in DB; reserved is virtual allocation. */
export type PantrySoftReserveEntry = {
  pantry_item_id: string;
  name: string;
  unit: string;
  on_hand: number;
  reserved: number;
  available: number;
  ingredient_id?: string;
};

export type AllocateAgainstPoolResult = {
  status: MealAvailabilityStatus;
  shortages: MealConfirmShortage[];
};

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function nameKey(name: string): string {
  return `name:${ingredientNameKey(name) || name.trim().toLowerCase()}`;
}

function rowKey(pantryItemId: string): string {
  return `row:${pantryItemId}`;
}

function idKey(ingredientId: string): string {
  return `id:${ingredientId}`;
}

function shortageAggKey(s: MealConfirmShortage): string {
  const id = s.ingredient_id?.trim();
  if (id) return `${idKey(id)}|${normalizeUnitKey(s.unit)}`;
  return `${nameKey(s.name)}|${normalizeUnitKey(s.unit)}`;
}

/**
 * Build a pool map keyed by ingredient_id, by normalized name (case / plural /
 * filler-adjective insensitive) and by pantry row id. Rows that share a name key
 * (different units) are chained through `siblings` so none is dropped.
 */
export function buildPantryPool(
  rows: PantryItemRow[],
): Map<string, PantryPoolEntry> {
  const pool = new Map<string, PantryPoolEntry>();
  for (const row of rows) {
    const entry: PantryPoolEntry = {
      name: row.name,
      pantry_item_id: row.id,
      quantity: quantityFromRow(row.quantity),
      unit: row.unit ?? 'pcs',
      ...(row.ingredient_id ? { ingredient_id: row.ingredient_id } : {}),
    };
    pool.set(rowKey(row.id), entry);
    if (row.ingredient_id) {
      const k = idKey(row.ingredient_id);
      const first = pool.get(k);
      if (first) (first.siblings ??= []).push(entry);
      else pool.set(k, entry);
    }
    const nk = nameKey(row.name);
    const firstByName = pool.get(nk);
    if (firstByName && firstByName !== entry) {
      (firstByName.siblings ??= []).push(entry);
    } else {
      pool.set(nk, entry);
    }
  }
  return pool;
}

function addDaysYmd(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

/** Default soft-reserve window: from → from+14 days inclusive. */
export function defaultSoftReserveRange(fromYmd: string): {
  from: string;
  to: string;
} {
  return { from: fromYmd, to: addDaysYmd(fromYmd, 14) };
}

/**
 * Soft-reserve pantry against active meal plans in [from, to].
 * Does not write D1. reserved = allocated amount; available = remaining pool.
 */
export async function computePantrySoftReserve(
  db: D1Database,
  userId: string,
  from: string,
  to: string,
): Promise<PantrySoftReserveEntry[]> {
  const [allPlans, pantryRows] = await Promise.all([
    listMealPlans(db, userId),
    listPantryItems(db, userId),
  ]);

  const plans = allPlans
    .filter(
      (p) =>
        isDateInRange(p.serving_date, from, to) &&
        ACTIVE_PLAN_STATUSES.has(p.status),
    )
    .sort((a, b) => {
      const d = a.serving_date.localeCompare(b.serving_date);
      if (d !== 0) return d;
      return (a.created_at ?? 0) - (b.created_at ?? 0);
    });

  const pool = buildPantryPool(pantryRows);
  const recipesCache: { rows?: RecipeRow[] } = {};

  for (const plan of plans) {
    const recipe = await resolvePlanRecipe(db, userId, plan, recipesCache);
    if (!recipe) continue;
    const ingredients = await listRecipeIngredientRows(db, recipe.id);
    allocateIngredientsAgainstPool(ingredients, pool, {
      hasRecipeId: true,
      recipeFound: true,
    });
  }

  return softReserveFromAllocatedPool(pantryRows, pool);
}

/** Map pantry rows to soft-reserve entries after pool allocation. */
export function softReserveFromAllocatedPool(
  pantryRows: PantryItemRow[],
  pool: Map<string, PantryPoolEntry>,
): PantrySoftReserveEntry[] {
  return pantryRows.map((row) => {
    const onHand = quantityFromRow(row.quantity);
    const entry =
      pool.get(rowKey(row.id)) ??
      (row.ingredient_id ? pool.get(idKey(row.ingredient_id)) : undefined) ??
      pool.get(nameKey(row.name));
    const available = entry ? Math.max(0, entry.quantity) : onHand;
    const reserved = Math.max(0, onHand - available);
    return {
      pantry_item_id: row.id,
      name: row.name,
      unit: row.unit ?? 'pcs',
      on_hand: onHand,
      reserved,
      available,
      ...(row.ingredient_id ? { ingredient_id: row.ingredient_id } : {}),
    };
  });
}

/** All pantry lots (rows) that match an ingredient by id or normalized name. */
function findPoolEntries(
  pool: Map<string, PantryPoolEntry>,
  ing: Pick<RecipeIngredientRow, 'ingredient_id' | 'name'>,
): PantryPoolEntry[] {
  const out: PantryPoolEntry[] = [];
  const add = (head: PantryPoolEntry | undefined) => {
    if (!head) return;
    for (const e of [head, ...(head.siblings ?? [])]) {
      if (!out.includes(e)) out.push(e);
    }
  };
  if (ing.ingredient_id) add(pool.get(idKey(ing.ingredient_id)));
  add(pool.get(nameKey(ing.name)));
  return out;
}

/** Normalize unit for comparison; empty → pcs. No conversion tables. */
export function normalizeUnitKey(unit: string | null | undefined): string {
  const t = unit?.trim();
  if (!t) return 'pcs';
  return canonicalUnit(t) ?? t.toLowerCase();
}

const EPS = 1e-6;

function roundQty(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function unitsMatch(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  return normalizeUnitKey(a) === normalizeUnitKey(b);
}

/**
 * Allocate recipe ingredients against a mutable pantry pool (preview / week lights).
 * Mutates `pool` quantities. Does not touch D1.
 */
export function allocateIngredientsAgainstPool(
  ingredients: RecipeIngredientRow[] | null | undefined,
  pool: Map<string, PantryPoolEntry>,
  opts?: { hasRecipeId: boolean; recipeFound: boolean },
): AllocateAgainstPoolResult {
  const hasRecipeId = opts?.hasRecipeId ?? true;
  const recipeFound = opts?.recipeFound ?? true;
  if (!hasRecipeId || !recipeFound) {
    return { status: 'unknown', shortages: [] };
  }

  const shortages: MealConfirmShortage[] = [];
  for (const ing of ingredients ?? []) {
    const needed = quantityFromRow(ing.quantity);
    const unit = ing.unit ?? 'pcs';
    const lots = findPoolEntries(pool, ing);
    const idPart = ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {};

    if (lots.length === 0) {
      shortages.push({ ...idPart, name: ing.name, needed, available: 0, unit });
      continue;
    }

    // Same-unit lots first, then lots convertible within weight / volume.
    let remaining = needed;
    let compatible = false;
    const ordered = [
      ...lots.filter((l) => unitsMatch(unit, l.unit)),
      ...lots.filter((l) => !unitsMatch(unit, l.unit)),
    ];
    for (const lot of ordered) {
      // Unit conversion plus cooked <-> dry staple ratio (1 kg raw rice covers 600 g cooked).
      const inNeedUnit = convertQtyBetweenItems(lot.quantity, lot.unit, unit, lot.name, ing.name);
      if (inNeedUnit == null) continue;
      compatible = true;
      if (remaining <= EPS) continue;
      const take = Math.min(Math.max(0, inNeedUnit), remaining);
      if (take <= 0) continue;
      remaining -= take;
      const back = convertQtyBetweenItems(take, unit, lot.unit, ing.name, lot.name);
      lot.quantity = Math.max(0, lot.quantity - (back ?? 0));
    }

    if (!compatible) {
      // available 0 so shopping deficit = full needed (count vs weight etc.)
      shortages.push({
        ...idPart,
        name: ing.name,
        needed,
        available: 0,
        unit,
        reason: 'unit_mismatch',
      });
      continue;
    }

    if (remaining > EPS) {
      shortages.push({
        ...idPart,
        name: ing.name,
        needed,
        available: roundQty(needed - remaining),
        unit,
      });
    }
  }

  return {
    status: shortages.length > 0 ? 'short' : 'ok',
    shortages,
  };
}

/**
 * Sum per-meal shortfalls into a shopping-oriented week list (needed = deficit).
 * Same item (normalized name or ingredient id) in convertible units is merged
 * into the first unit seen, so "eggs 2 pcs" + "eggs 2 pcs" -> 4 pcs.
 */
export function aggregateWeekShortages(
  mealShortages: MealConfirmShortage[][],
): MealConfirmShortage[] {
  const out: MealConfirmShortage[] = [];
  const itemKey = (s: MealConfirmShortage) => {
    const id = s.ingredient_id?.trim();
    return id ? idKey(id) : nameKey(s.name);
  };
  for (const list of mealShortages) {
    for (const s of list) {
      const deficit = Math.max(0, s.needed - s.available);
      if (deficit <= EPS) continue;
      const key = itemKey(s);
      let merged = false;
      for (const existing of out) {
        if (itemKey(existing) !== key && nameKey(existing.name) !== nameKey(s.name)) {
          continue;
        }
        const inExisting = convertQtyBetweenItems(
          deficit,
          s.unit,
          existing.unit,
          s.name,
          existing.name,
        );
        if (inExisting == null) continue;
        existing.needed = roundQty(existing.needed + inExisting);
        merged = true;
        break;
      }
      if (!merged) {
        out.push({
          ...(s.ingredient_id ? { ingredient_id: s.ingredient_id } : {}),
          name: s.name,
          needed: roundQty(deficit),
          available: 0,
          unit: s.unit,
        });
      }
    }
  }
  return out;
}

function isDateInRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

const ACTIVE_PLAN_STATUSES = new Set(['PLANNED', 'PENDING_CONFIRM']);

/**
 * Recipe backing a planned meal. Uses recipe_id when it resolves; otherwise
 * falls back to a case-insensitive meal_name match so meals saved without a
 * recipe id (e.g. by planMeals) are still checked against the pantry.
 */
export async function resolvePlanRecipe(
  db: D1Database,
  userId: string,
  plan: Pick<MealPlanRow, 'recipe_id' | 'meal_name'>,
  recipesCache?: { rows?: RecipeRow[] },
): Promise<RecipeRow | null> {
  if (plan.recipe_id) {
    const byId = await getRecipe(db, userId, plan.recipe_id);
    if (byId) return byId;
  }
  const name = plan.meal_name?.trim().toLowerCase();
  if (!name) return null;
  const rows = recipesCache?.rows ?? (await listRecipes(db, userId));
  if (recipesCache) recipesCache.rows = rows;
  return rows.find((r) => r.meal_name.trim().toLowerCase() === name) ?? null;
}

export async function computeWeekAvailability(
  db: D1Database,
  userId: string,
  from: string,
  to: string,
): Promise<WeekAvailabilityResult> {
  const [allPlans, pantryRows] = await Promise.all([
    listMealPlans(db, userId),
    listPantryItems(db, userId),
  ]);

  const plans = allPlans
    .filter((p) => isDateInRange(p.serving_date, from, to))
    .sort((a, b) => {
      const d = a.serving_date.localeCompare(b.serving_date);
      if (d !== 0) return d;
      return (a.created_at ?? 0) - (b.created_at ?? 0);
    });

  const pool = buildPantryPool(pantryRows);
  const meals: MealAvailabilityEntry[] = [];
  const recipesCache: { rows?: RecipeRow[] } = {};
  const shortfallLists: MealConfirmShortage[][] = [];

  for (const plan of plans) {
    if (!ACTIVE_PLAN_STATUSES.has(plan.status)) {
      meals.push(mealAvailabilityEntry(plan, 'ok', []));
      continue;
    }

    const recipe = await resolvePlanRecipe(db, userId, plan, recipesCache);
    if (!recipe) {
      meals.push(mealAvailabilityEntry(plan, 'unknown', []));
      continue;
    }

    const ingredients = await listRecipeIngredientRows(db, recipe.id);
    const result = allocateIngredientsAgainstPool(ingredients, pool, {
      hasRecipeId: true,
      recipeFound: true,
    });
    meals.push(
      mealAvailabilityEntry(plan, result.status, result.shortages),
    );
    if (result.shortages.length > 0) {
      shortfallLists.push(result.shortages);
    }
  }

  return {
    meals,
    weekShortages: aggregateWeekShortages(shortfallLists),
  };
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
  // Loose match (plural / "cooked rice" ~ "rice") so confirm agrees with the Need lights.
  return findPantryByNameLoose(db, userId, ing.name);
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

  {
    const recipe = await resolvePlanRecipe(db, userId, plan);
    if (recipe) {
      const ingredients = await listRecipeIngredientRows(db, recipe.id);
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
        let needInPantryUnit = needed;
        let convertible = true;
        if (!unitsMatch(unit, pantry.unit)) {
          const conv = convertQtyBetweenItems(needed, unit, pantry.unit, ing.name, pantry.name);
          if (conv == null) convertible = false;
          else needInPantryUnit = conv;
        } else {
          needInPantryUnit = convertQtyBetweenItems(needed, unit, pantry.unit, ing.name, pantry.name) ?? needed;
        }
        if (!convertible) {
          shortages.push({
            ...(ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {}),
            name: ing.name,
            needed,
            available: 0,
            unit,
            reason: 'unit_mismatch',
          });
          continue;
        }

        const deductQty = Math.min(available, needInPantryUnit);
        const newQty = available - deductQty;

        if (newQty <= 0) {
          await deletePantryItem(db, userId, pantry.id);
        } else {
          await updatePantryItem(db, userId, pantry.id, { quantity: newQty });
        }

        if (deductQty > 0) {
          deducted.push({
            ...(ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {}),
            name: ing.name,
            deducted: deductQty,
            previous_quantity: available,
            new_quantity: Math.max(0, newQty),
            unit: pantry.unit ?? unit,
          });
        }

        if (deductQty < needInPantryUnit) {
          shortages.push({
            ...(ing.ingredient_id ? { ingredient_id: ing.ingredient_id } : {}),
            name: ing.name,
            needed: needInPantryUnit,
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

export function shortageDeficit(s: MealConfirmShortage): number {
  return roundQty(Math.max(0, s.needed - (s.available ?? 0)));
}
