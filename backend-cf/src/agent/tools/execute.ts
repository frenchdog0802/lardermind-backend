import {
  listPantryItems,
  mergeAddPantryItem,
  toPantryItemDto,
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
  createMealPlan,
  listMealPlans,
  toMealPlanDto,
} from '../../db/meal-plan';
import {
  getOrCreatePreferences,
  toPreferencesDto,
  upsertPreferences,
} from '../../db/preferences';
import {
  createShoppingListItem,
  toShoppingListItemDto,
} from '../../db/shopping-list';
import {
  mealPlanUpdatedCardData,
  recipeCreatedCardData,
  TOOL_CARD_TYPES,
} from './cards';

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

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
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
  const pantry = await listPantryItems(db, userId);
  const pantryNames = new Set(
    pantry.map((p) => normalizeName(p.name)).filter(Boolean),
  );
  const recipes = await listRecipes(db, userId);
  const scored: Array<{
    recipe: ReturnType<typeof toRecipeDto>;
    score: number;
    matched: string[];
  }> = [];

  for (const row of recipes) {
    const ingredients = await listRecipeIngredientRows(db, row.id);
    const matched: string[] = [];
    for (const ing of ingredients) {
      const n = normalizeName(ing.name);
      if (n && pantryNames.has(n)) matched.push(ing.name);
    }
    if (matched.length === 0) continue;
    scored.push({
      recipe: toRecipeDto(row, ingredients),
      score: matched.length,
      matched,
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const suggestions = scored.slice(0, 8).map((s) => ({
    id: s.recipe.id,
    meal_name: s.recipe.meal_name,
    score: s.score,
    matchedIngredients: s.matched,
    image: s.recipe.image,
  }));

  const cardType = TOOL_CARD_TYPES.suggestMealsFromPantry!;
  return {
    content: JSON.stringify({ suggestions, pantryItemCount: pantry.length }),
    cardType,
    cardData: { suggestions },
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
      const rows = await listPantryItems(db, userId);
      const items = rows.map(toPantryItemDto);
      return {
        content: JSON.stringify({
          items,
          summary: items.map(
            (i) => `${i.name} (${i.quantity} ${i.unit})`,
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
    case 'addItemsToShoppingList': {
      const items = itemListFromArgs(args);
      const created = [];
      for (const item of items) {
        const row = await createShoppingListItem(db, userId, item);
        created.push(toShoppingListItemDto(row));
      }
      const cardType = TOOL_CARD_TYPES.addItemsToShoppingList!;
      return {
        content: JSON.stringify({ items: created }),
        cardType,
        cardData: { items: created, itemsAdded: created.length },
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
