import {
  deletePantryItem,
  findByNameCi,
  getPantryItem,
  mergeAddPantryItem,
  toPantryItemDto,
  updatePantryItem,
  type PantryItemRow,
} from '../../db/pantry';
import {
  createRecipe,
  getRecipe,
  getRecipeDto,
  listRecipeIngredientRows,
  listRecipes,
  toRecipeDto,
  type RecipeIngredientInput,
} from '../../db/recipe';
import {
  computePantrySoftReserve,
  computeWeekAvailability,
  createMealPlan,
  defaultSoftReserveRange,
  listMealPlans,
  normalizeUnitKey,
  toMealPlanDto,
  unitsMatch,
  type MealConfirmShortage,
  type PantrySoftReserveEntry,
} from '../../db/meal-plan';
import {
  getOrCreatePreferences,
  readAssumeBasicSeasonings,
  toPreferencesDto,
  upsertPreferences,
} from '../../db/preferences';
import {
  mergeAddShoppingListItem,
  toShoppingListItemDto,
} from '../../db/shopping-list';
import {
  convertQuantity,
  findConversion,
  listConversionsForUser,
  type UnitConversionRow,
} from '../../db/unit-conversions';
import {
  mealPlanUpdatedCardData,
  mealSuggestionsCardData,
  recipeCreatedCardData,
  TOOL_CARD_TYPES,
  type DefineUnitAction,
} from './cards';
import { normalizeName } from './names';
import {
  classifyCookStatus,
  conditionalSeasonings,
  missingMains,
} from './seasonings';

const DEFINE_UNIT_ACTION_CAP = 5;

type StockLot = { unit: string; available: number; displayName: string };

function buildStockByName(
  soft: PantrySoftReserveEntry[],
): Map<string, StockLot[]> {
  const byName = new Map<string, StockLot[]>();
  for (const s of soft) {
    const key = normalizeName(s.name);
    if (!key) continue;
    const list = byName.get(key) ?? [];
    list.push({
      unit: s.unit,
      available: s.available,
      displayName: s.name,
    });
    byName.set(key, list);
  }
  return byName;
}

function actionKey(a: DefineUnitAction): string {
  return `${normalizeName(a.item)}|${normalizeUnitKey(a.from_unit)}|${normalizeUnitKey(a.to_unit)}`;
}

/** Compare one recipe ingredient against pantry lots (unit-aware). */
export function matchIngredientAgainstStock(opts: {
  ingredientName: string;
  needed: number;
  needUnit: string;
  lots: StockLot[];
  conversions: UnitConversionRow[];
}): {
  matched: boolean;
  partial: boolean;
  unitMismatch: DefineUnitAction | null;
} {
  const { ingredientName, needed, needUnit, lots, conversions } = opts;
  if (lots.length === 0) {
    return { matched: false, partial: false, unitMismatch: null };
  }

  let haveInNeedUnit = 0;
  let mismatchFrom: string | null = null;
  let displayName = ingredientName;

  for (const lot of lots) {
    if (lot.available <= 0) continue;
    displayName = lot.displayName || displayName;
    if (unitsMatch(lot.unit, needUnit)) {
      haveInNeedUnit += lot.available;
      continue;
    }
    const conv = findConversion(
      conversions,
      ingredientName,
      lot.unit,
      needUnit,
    );
    if (conv) {
      const converted = convertQuantity(
        lot.available,
        lot.unit,
        needUnit,
        conv,
      );
      if (converted != null) haveInNeedUnit += converted;
    } else if (!mismatchFrom) {
      mismatchFrom = lot.unit;
    }
  }

  if (haveInNeedUnit >= needed && needed >= 0) {
    return { matched: true, partial: false, unitMismatch: null };
  }
  if (mismatchFrom) {
    return {
      matched: false,
      partial: haveInNeedUnit > 0,
      unitMismatch: {
        action_required: 'define_unit',
        item: displayName,
        from_unit: mismatchFrom,
        to_unit: needUnit.trim() || 'pcs',
      },
    };
  }
  if (haveInNeedUnit > 0 && haveInNeedUnit < needed) {
    return { matched: true, partial: true, unitMismatch: null };
  }
  return { matched: false, partial: false, unitMismatch: null };
}

const PLAN_MEALS_MAX = 28;

/** Map availability shortages to shopping-list item inputs. */
export function shortagesToShoppingItems(
  shortages: MealConfirmShortage[],
): Array<{ name: string; quantity: number; unit: string }> {
  const out: Array<{ name: string; quantity: number; unit: string }> = [];
  for (const s of shortages) {
    const name = s.name?.trim();
    if (!name) continue;
    const qty = Number.isFinite(s.needed) ? Math.max(0, s.needed) : 0;
    if (qty <= 0) continue;
    out.push({
      name,
      quantity: qty,
      unit: s.unit?.trim() || 'pcs',
    });
  }
  return out;
}

export type ToolExecResult = {
  content: string;
  cardType?: string;
  cardData?: Record<string, unknown>;
};

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function asNumber(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function itemListFromArgs(args: Record<string, unknown>): Array<{
  name: string;
  quantity: number;
  unit: string;
}> {
  const raw = Array.isArray(args.items) ? args.items : [];
  const out: Array<{ name: string; quantity: number; unit: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = asString(obj.name).trim();
    if (!name) continue;
    out.push({
      name,
      quantity: asNumber(obj.quantity, 1),
      unit: asString(obj.unit, 'pcs').trim() || 'pcs',
    });
  }
  return out;
}

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

async function resolvePantryRow(
  db: D1Database,
  userId: string,
  obj: Record<string, unknown>,
): Promise<PantryItemRow | null> {
  const id = asString(obj.pantry_item_id).trim();
  if (id) {
    return getPantryItem(db, userId, id);
  }
  const name = asString(obj.name).trim();
  if (!name) return null;
  return findByNameCi(db, userId, name);
}

async function executeUpdatePantryItems(
  db: D1Database,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  const raw = Array.isArray(args.items) ? args.items : [];
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ name?: string; pantry_item_id?: string; error: string }> =
    [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      errors.push({ error: 'Invalid item' });
      continue;
    }
    const obj = item as Record<string, unknown>;
    const labelName = asString(obj.name).trim() || undefined;
    const labelId = asString(obj.pantry_item_id).trim() || undefined;
    const row = await resolvePantryRow(db, userId, obj);
    if (!row) {
      errors.push({
        ...(labelName ? { name: labelName } : {}),
        ...(labelId ? { pantry_item_id: labelId } : {}),
        error: 'Pantry item not found',
      });
      continue;
    }

    const hasDelta = obj.delta !== undefined && obj.delta !== null;
    const hasQuantity = obj.quantity !== undefined && obj.quantity !== null;
    const modeExplicit = asString(obj.mode).trim();
    const mode: 'set' | 'delta' =
      modeExplicit === 'delta' || modeExplicit === 'set'
        ? modeExplicit
        : hasDelta
          ? 'delta'
          : 'set';

    if (mode === 'delta' && !hasDelta) {
      errors.push({
        name: row.name,
        pantry_item_id: row.id,
        error: 'delta is required when mode is delta',
      });
      continue;
    }
    if (mode === 'set' && !hasQuantity) {
      errors.push({
        name: row.name,
        pantry_item_id: row.id,
        error: 'quantity is required when mode is set',
      });
      continue;
    }

    const current = quantityFromRow(row.quantity);
    const newQty =
      mode === 'delta' ? current + asNumber(obj.delta, 0) : asNumber(obj.quantity, 0);

    if (newQty <= 0) {
      const deleted = await deletePantryItem(db, userId, row.id);
      results.push({
        id: row.id,
        name: row.name,
        deleted: deleted,
        previous_quantity: current,
        quantity: 0,
      });
      continue;
    }

    const unit =
      asString(obj.unit).trim() || row.unit?.trim() || 'pcs';
    const updated = await updatePantryItem(db, userId, row.id, {
      quantity: newQty,
      unit,
    });
    if (!updated) {
      errors.push({
        name: row.name,
        pantry_item_id: row.id,
        error: 'Failed to update pantry item',
      });
      continue;
    }
    results.push({
      ...toPantryItemDto(updated),
      previous_quantity: current,
      updated: true,
    });
  }

  const cardType = TOOL_CARD_TYPES.updatePantryItems!;
  return {
    content: JSON.stringify({ items: results, errors }),
    cardType,
    cardData: {
      items: results,
      itemsUpdated: results.length,
      errors,
    },
  };
}

async function executeRemovePantryItems(
  db: D1Database,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  const raw = Array.isArray(args.items) ? args.items : [];
  const results: Array<Record<string, unknown>> = [];
  const errors: Array<{ name?: string; pantry_item_id?: string; error: string }> =
    [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      errors.push({ error: 'Invalid item' });
      continue;
    }
    const obj = item as Record<string, unknown>;
    const labelName = asString(obj.name).trim() || undefined;
    const labelId = asString(obj.pantry_item_id).trim() || undefined;
    const row = await resolvePantryRow(db, userId, obj);
    if (!row) {
      errors.push({
        ...(labelName ? { name: labelName } : {}),
        ...(labelId ? { pantry_item_id: labelId } : {}),
        error: 'Pantry item not found',
      });
      continue;
    }
    const deleted = await deletePantryItem(db, userId, row.id);
    results.push({
      id: row.id,
      name: row.name,
      deleted,
      previous_quantity: quantityFromRow(row.quantity),
      unit: row.unit ?? 'pcs',
    });
  }

  const cardType = TOOL_CARD_TYPES.removePantryItems!;
  return {
    content: JSON.stringify({ items: results, errors }),
    cardType,
    cardData: {
      items: results,
      itemsRemoved: results.length,
      errors,
    },
  };
}

function ingredientInputsFromArgs(
  args: Record<string, unknown>,
): RecipeIngredientInput[] {
  const raw = Array.isArray(args.ingredients) ? args.ingredients : [];
  const out: RecipeIngredientInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const name = asString(obj.name).trim();
    if (!name) continue;
    out.push({
      name,
      quantity: asNumber(obj.quantity, 0),
      unit: asString(obj.unit, 'pcs').trim() || 'pcs',
      ...(typeof obj.ingredient_id === 'string'
        ? { ingredient_id: obj.ingredient_id }
        : {}),
    });
  }
  return out;
}

async function suggestMealsFromPantry(
  db: D1Database,
  userId: string,
): Promise<ToolExecResult> {
  const prefs = await getOrCreatePreferences(db, userId);
  const assumeBasicSeasonings = readAssumeBasicSeasonings(prefs);

  const today = new Date().toISOString().slice(0, 10);
  const range = defaultSoftReserveRange(today);
  const [soft, conversions] = await Promise.all([
    computePantrySoftReserve(db, userId, range.from, range.to),
    listConversionsForUser(db, userId),
  ]);
  /** Prefer available stock (after soft reserve), keyed by name with units. */
  const stockByName = buildStockByName(soft);
  const defineUnitActions = new Map<string, DefineUnitAction>();

  const recipes = await listRecipes(db, userId);
  const scored: Array<{
    recipe: ReturnType<typeof toRecipeDto>;
    score: number;
    matchScore: number;
    matched: string[];
    missing: string[];
    missingMains: string[];
    conditionalSeasonings: string[];
    cookStatus: ReturnType<typeof classifyCookStatus>;
    cookable: boolean;
  }> = [];

  for (const row of recipes) {
    const ingredients = await listRecipeIngredientRows(db, row.id);
    const matched: string[] = [];
    const missing: string[] = [];
    for (const ing of ingredients) {
      const n = normalizeName(ing.name);
      if (!n) continue;
      const need = Number(ing.quantity);
      const needed = Number.isFinite(need) ? need : 0;
      const result = matchIngredientAgainstStock({
        ingredientName: ing.name,
        needed,
        needUnit: ing.unit ?? 'pcs',
        lots: stockByName.get(n) ?? [],
        conversions,
      });
      if (result.unitMismatch && defineUnitActions.size < DEFINE_UNIT_ACTION_CAP) {
        defineUnitActions.set(
          actionKey(result.unitMismatch),
          result.unitMismatch,
        );
      }
      if (result.matched && !result.partial && !result.unitMismatch) {
        matched.push(ing.name);
      } else if (result.matched && result.partial) {
        matched.push(ing.name);
        missing.push(ing.name);
      } else {
        // Pantry name overlap (incl. unit mismatch) still counts as matched for ranking
        if ((stockByName.get(n) ?? []).some((l) => l.available > 0)) {
          matched.push(ing.name);
        }
        missing.push(ing.name);
      }
    }
    if (matched.length === 0 && missing.length === ingredients.length) {
      // no pantry overlap at all — skip unless recipe has no ingredients
      if (ingredients.length > 0) continue;
    }
    const cookStatus =
      ingredients.length === 0
        ? 'uncookable'
        : classifyCookStatus(missing, assumeBasicSeasonings);
    const cookable = cookStatus === 'cookable';
    const conditional =
      cookStatus === 'conditionally_cookable'
        ? conditionalSeasonings(missing)
        : [];
    const mains = missingMains(missing);
    // Prefer cookable; then conditional; score = matched count + boosts
    const score =
      matched.length +
      (cookable ? 100 : 0) +
      (cookStatus === 'conditionally_cookable' ? 50 : 0);
    const matchScore =
      ingredients.length === 0
        ? 0
        : Math.round((matched.length / ingredients.length) * 100);
    if (matched.length === 0 && !cookable) continue;
    scored.push({
      recipe: toRecipeDto(row, ingredients),
      score,
      matchScore,
      matched,
      missing,
      missingMains: mains,
      conditionalSeasonings: conditional,
      cookStatus,
      cookable,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const suggestions = scored.slice(0, 8).map((s) => ({
    id: s.recipe.id,
    meal_name: s.recipe.meal_name,
    score: s.score,
    matchScore: s.matchScore,
    matchedIngredients: s.matched,
    missingIngredients: s.missing,
    missingMains: s.missingMains,
    ...(s.conditionalSeasonings.length > 0
      ? { conditionalSeasonings: s.conditionalSeasonings }
      : {}),
    cookStatus: s.cookStatus,
    cookable: s.cookable,
    image: s.recipe.image,
  }));

  const actions = [...defineUnitActions.values()].slice(
    0,
    DEFINE_UNIT_ACTION_CAP,
  );
  const cardType = TOOL_CARD_TYPES.suggestMealsFromPantry!;
  return {
    content: JSON.stringify({
      suggestions,
      pantryItemCount: soft.length,
      softReserveWindow: range,
      cookableCount: suggestions.filter((s) => s.cookable).length,
      conditionallyCookableCount: suggestions.filter(
        (s) => s.cookStatus === 'conditionally_cookable',
      ).length,
      assumeBasicSeasonings,
      ...(actions.length > 0 ? { actions } : {}),
    }),
    cardType,
    cardData: mealSuggestionsCardData(suggestions, actions),
  };
}

async function executePlanMeals(
  db: D1Database,
  userId: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  const raw = Array.isArray(args.meals) ? args.meals : [];
  const truncated = raw.length > PLAN_MEALS_MAX;
  const slice = raw.slice(0, PLAN_MEALS_MAX);
  const created: ReturnType<typeof toMealPlanDto>[] = [];
  const errors: Array<{ index: number; error: string }> = [];

  for (let i = 0; i < slice.length; i++) {
    const item = slice[i];
    if (!item || typeof item !== 'object') {
      errors.push({ index: i, error: 'Invalid meal entry' });
      continue;
    }
    const obj = item as Record<string, unknown>;
    const mealType = asString(obj.meal_type).trim();
    const servingDate = asString(obj.serving_date).trim();
    if (!mealType || !servingDate) {
      errors.push({
        index: i,
        error: 'meal_type and serving_date are required',
      });
      continue;
    }
    let mealName = asString(obj.meal_name).trim();
    const recipeId = asString(obj.recipe_id).trim() || undefined;
    if (!mealName && recipeId) {
      const recipe = await getRecipe(db, userId, recipeId);
      mealName = recipe?.meal_name ?? '';
    }
    if (!mealName) {
      errors.push({ index: i, error: 'meal_name is required' });
      continue;
    }
    try {
      const row = await createMealPlan(db, userId, {
        meal_type: mealType,
        serving_date: servingDate,
        recipe_id: recipeId,
        meal_name: mealName,
      });
      created.push(toMealPlanDto(row));
    } catch (e) {
      errors.push({
        index: i,
        error: e instanceof Error ? e.message : 'Failed to create meal plan',
      });
    }
  }

  const cardType = TOOL_CARD_TYPES.planMeals!;
  const mealsCard = created.map(mealPlanUpdatedCardData);
  return {
    content: JSON.stringify({
      created,
      errors,
      truncated,
      note: 'Soft-reserve only; on-hand pantry unchanged until meal confirm.',
    }),
    cardType,
    cardData: {
      mealsScheduled: created.length,
      meals: mealsCard,
      ...(created[0] ? mealPlanUpdatedCardData(created[0]) : {}),
    },
  };
}

export async function executeTool(
  db: D1Database,
  userId: string,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolExecResult> {
  switch (name) {
    case 'listPantry': {
      const fromArg = asString(args.from).trim();
      const toArg = asString(args.to).trim();
      const today = new Date().toISOString().slice(0, 10);
      const range =
        fromArg && toArg
          ? { from: fromArg, to: toArg }
          : fromArg
            ? defaultSoftReserveRange(fromArg)
            : defaultSoftReserveRange(today);
      const soft = await computePantrySoftReserve(
        db,
        userId,
        range.from,
        range.to,
      );
      const items = soft.map((s) => {
        const base = {
          id: s.pantry_item_id,
          name: s.name,
          quantity: s.on_hand,
          unit: s.unit,
          on_hand: s.on_hand,
          reserved: s.reserved,
          available: s.available,
        };
        return s.ingredient_id
          ? { ...base, ingredient_id: s.ingredient_id }
          : base;
      });
      return {
        content: JSON.stringify({
          items,
          softReserveWindow: range,
          summary: items.map((i) =>
            i.reserved > 0
              ? `${i.name} (on_hand ${i.on_hand} ${i.unit}, reserved ${i.reserved}, available ${i.available})`
              : `${i.name} (${i.quantity} ${i.unit})`,
          ),
        }),
      };
    }
    case 'listMyRecipes': {
      const rows = await listRecipes(db, userId);
      const recipes = [];
      for (const row of rows) {
        const ingredients = await listRecipeIngredientRows(db, row.id);
        recipes.push(toRecipeDto(row, ingredients));
      }
      return {
        content: JSON.stringify({
          recipes: recipes.map((r) => ({
            id: r.id,
            meal_name: r.meal_name,
            ingredientCount: r.ingredients.length,
          })),
        }),
      };
    }
    case 'getRecipeDetails': {
      const recipeId = asString(args.recipeId).trim();
      if (!recipeId) {
        return { content: JSON.stringify({ error: 'recipeId is required' }) };
      }
      const recipe = await getRecipeDto(db, userId, recipeId);
      if (!recipe) {
        return { content: JSON.stringify({ error: 'Recipe not found' }) };
      }
      return { content: JSON.stringify({ recipe }) };
    }
    case 'listMealPlans': {
      const rows = await listMealPlans(db, userId);
      const plans = rows.map(toMealPlanDto);
      return { content: JSON.stringify({ plans }) };
    }
    case 'getPreferences': {
      const row = await getOrCreatePreferences(db, userId);
      return {
        content: JSON.stringify({ preferences: toPreferencesDto(row) }),
      };
    }
    case 'suggestMealsFromPantry':
      return suggestMealsFromPantry(db, userId);
    case 'getMealPlanAvailability': {
      const from = asString(args.from).trim();
      const to = asString(args.to).trim();
      if (!from || !to) {
        return {
          content: JSON.stringify({ error: 'from and to are required' }),
        };
      }
      if (from > to) {
        return {
          content: JSON.stringify({ error: 'from must be <= to' }),
        };
      }
      const result = await computeWeekAvailability(db, userId, from, to);
      const shoppingHints = shortagesToShoppingItems(result.weekShortages);
      return {
        content: JSON.stringify({
          ...result,
          shoppingHints,
          note: 'Read-only soft-reserve preview. Use addItemsToShoppingList for deficits after user approval.',
        }),
      };
    }
    case 'planMeals':
      return executePlanMeals(db, userId, args);
    case 'addPantryItems': {
      const items = itemListFromArgs(args);
      const added = [];
      for (const item of items) {
        const { item: row, merged } = await mergeAddPantryItem(db, userId, item);
        added.push({ ...toPantryItemDto(row), merged });
      }
      const cardType = TOOL_CARD_TYPES.addPantryItems!;
      return {
        content: JSON.stringify({ items: added }),
        cardType,
        cardData: { items: added, itemsAdded: added.length },
      };
    }
    case 'updatePantryItems':
      return executeUpdatePantryItems(db, userId, args);
    case 'removePantryItems':
      return executeRemovePantryItems(db, userId, args);
    case 'addItemsToShoppingList': {
      const items = itemListFromArgs(args);
      const created = [];
      let mergedCount = 0;
      for (const item of items) {
        const { item: row, merged } = await mergeAddShoppingListItem(
          db,
          userId,
          item,
        );
        if (merged) mergedCount += 1;
        created.push(toShoppingListItemDto(row));
      }
      const cardType = TOOL_CARD_TYPES.addItemsToShoppingList!;
      return {
        content: JSON.stringify({ items: created, mergedCount }),
        cardType,
        cardData: {
          items: created,
          itemsAdded: created.length,
          mergedCount,
        },
      };
    }
    case 'createRecipe': {
      const mealName = asString(args.meal_name).trim();
      if (!mealName) {
        return { content: JSON.stringify({ error: 'meal_name is required' }) };
      }
      const recipe = await createRecipe(db, userId, {
        meal_name: mealName,
        folder_id: asString(args.folder_id).trim() || undefined,
        instructions: Array.isArray(args.instructions)
          ? (args.instructions as unknown[]).map((s) => String(s))
          : asString(args.instructions),
        ingredients: ingredientInputsFromArgs(args),
      });
      const cardType = TOOL_CARD_TYPES.createRecipe!;
      return {
        content: JSON.stringify({ recipe }),
        cardType,
        cardData: recipeCreatedCardData(recipe),
      };
    }
    case 'addRecipeToMenu': {
      const mealType = asString(args.meal_type).trim();
      const servingDate = asString(args.serving_date).trim();
      if (!mealType || !servingDate) {
        return {
          content: JSON.stringify({
            error: 'meal_type and serving_date are required',
          }),
        };
      }
      let mealName = asString(args.meal_name).trim();
      const recipeId = asString(args.recipe_id).trim() || undefined;
      if (!mealName && recipeId) {
        const recipe = await getRecipe(db, userId, recipeId);
        mealName = recipe?.meal_name ?? '';
      }
      const row = await createMealPlan(db, userId, {
        meal_type: mealType,
        serving_date: servingDate,
        recipe_id: recipeId,
        meal_name: mealName,
      });
      const plan = toMealPlanDto(row);
      const cardType = TOOL_CARD_TYPES.addRecipeToMenu!;
      return {
        content: JSON.stringify({ plan }),
        cardType,
        cardData: mealPlanUpdatedCardData(plan),
      };
    }
    case 'updatePreferences': {
      const row = await upsertPreferences(db, userId, {
        ...(Array.isArray(args.allergies)
          ? { allergies: args.allergies.map(String) }
          : {}),
        ...(Array.isArray(args.dislikes)
          ? { dislikes: args.dislikes.map(String) }
          : {}),
        ...(Array.isArray(args.likes)
          ? { likes: args.likes.map(String) }
          : {}),
        ...(Array.isArray(args.dietaryRestrictions)
          ? { dietaryRestrictions: args.dietaryRestrictions.map(String) }
          : {}),
        ...(typeof args.householdNotes === 'string'
          ? { householdNotes: args.householdNotes }
          : {}),
        ...(typeof args.measurementUnit === 'string'
          ? { measurementUnit: args.measurementUnit }
          : {}),
        ...(typeof args.notes === 'string' ? { notes: args.notes } : {}),
        ...(typeof args.assumeBasicSeasonings === 'boolean'
          ? { assumeBasicSeasonings: args.assumeBasicSeasonings }
          : {}),
      });
      const preferences = toPreferencesDto(row);
      const cardType = TOOL_CARD_TYPES.updatePreferences!;
      return {
        content: JSON.stringify({ preferences }),
        cardType,
        cardData: { preferences },
      };
    }
    default:
      return {
        content: JSON.stringify({ error: `Unknown tool: ${name}` }),
      };
  }
}
