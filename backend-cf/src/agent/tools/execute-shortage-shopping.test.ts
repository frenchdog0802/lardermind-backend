import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MealPlanRow } from '../../db/meal-plan';
import type { PantryItemRow } from '../../db/pantry';
import type { RecipeIngredientRow, RecipeRow } from '../../db/recipe';
import type { ShoppingListItemRow } from '../../db/shopping-list';

const state = {
  pantry: [] as PantryItemRow[],
  recipes: [] as RecipeRow[],
  ingredients: new Map<string, RecipeIngredientRow[]>(),
  plans: [] as MealPlanRow[],
  shopping: [] as ShoppingListItemRow[],
};

vi.mock('../../db/pantry', async (orig) => ({
  ...(await orig<typeof import('../../db/pantry')>()),
  listPantryItems: async () => state.pantry,
}));
vi.mock('../../db/recipe', async (orig) => ({
  ...(await orig<typeof import('../../db/recipe')>()),
  listRecipes: async () => state.recipes,
  getRecipe: async (_db: unknown, _u: string, id: string) =>
    state.recipes.find((r) => r.id === id) ?? null,
  listRecipeIngredientRows: async (_db: unknown, id: string) =>
    state.ingredients.get(id) ?? [],
  listIngredientRowsForRecipes: async (_db: unknown, ids: string[]) =>
    new Map(ids.map((id) => [id, state.ingredients.get(id) ?? []] as const)),
}));
vi.mock('../../db/shopping-list', async (orig) => ({
  ...(await orig<typeof import('../../db/shopping-list')>()),
  listShoppingListItems: async () => state.shopping,
  mergeAddShoppingListItem: async (
    _db: unknown,
    userId: string,
    input: { name: string; quantity: number; unit: string },
  ) => {
    const existing = state.shopping.find(
      (r) =>
        r.checked === 0 &&
        r.name.toLowerCase() === input.name.toLowerCase() &&
        r.unit === input.unit,
    );
    if (existing) {
      existing.quantity = String(Number(existing.quantity) + input.quantity);
      return { item: existing, merged: true };
    }
    const row: ShoppingListItemRow = {
      id: `s${state.shopping.length + 1}`,
      user_id: userId,
      name: input.name,
      quantity: String(input.quantity),
      unit: input.unit,
      checked: 0,
      ingredient_id: null,
      has_been_added_to_pantry: 0,
      created_at: 1,
      updated_at: 1,
      version: 1,
    };
    state.shopping.push(row);
    return { item: row, merged: false };
  },
}));

// Imported after the mocks are registered.
const { executeTool } = await import('./execute');
const { computeWeekAvailability } = await import('../../db/meal-plan');

const db = {
  prepare() {
    return {
      bind() {
        return this;
      },
      async all() {
        return { results: state.plans };
      },
      async first() {
        return null;
      },
      async run() {
        return { meta: { changes: 0 } };
      },
    };
  },
} as unknown as D1Database;

function pantryRow(
  id: string,
  name: string,
  quantity: string,
  unit: string,
): PantryItemRow {
  return {
    id,
    user_id: 'u1',
    name,
    quantity,
    unit,
    notes: null,
    ingredient_id: null,
    created_at: 1,
    updated_at: 1,
  };
}

function recipe(
  id: string,
  name: string,
  ings: Array<[string, string, string]>,
) {
  state.recipes.push({
    id,
    user_id: 'u1',
    folder_id: null,
    meal_name: name,
    instructions: '[]',
    image_url: null,
    image_public_id: null,
    created_at: 1,
    updated_at: 1,
  });
  state.ingredients.set(
    id,
    ings.map(([n, q, u], i) => ({
      id: `${id}-${i}`,
      recipe_id: id,
      name: n,
      quantity: q,
      unit: u,
      ingredient_id: null,
      sort_order: i,
    })),
  );
}

function plan(
  id: string,
  date: string,
  recipeId: string | null,
  name: string,
): MealPlanRow {
  return {
    id,
    user_id: 'u1',
    meal_type: 'dinner',
    serving_date: date,
    recipe_id: recipeId,
    meal_name: name,
    image: null,
    status: 'PLANNED',
    created_at: Number(id.replace(/\D/g, '')) || 1,
    updated_at: 1,
  };
}

const RANGE = { from: '2026-11-16', to: '2026-11-22' };

beforeEach(() => {
  state.pantry = [];
  state.recipes = [];
  state.ingredients = new Map();
  state.plans = [];
  state.shopping = [];
});

describe('addMealPlanShortagesToShoppingList', () => {
  it('does not re-add items the pantry already covers; adds only the remainder', async () => {
    state.pantry = [
      pantryRow('p1', 'Milk', '1000', 'ml'),
      pantryRow('p2', 'Sugar', '100', 'g'),
      pantryRow('p3', 'Tomatoes', '6', 'pcs'),
      pantryRow('p4', 'Olive Oil', '0.5', 'l'),
    ];
    recipe('r1', 'Shakshuka', [
      ['milk', '1', 'l'],
      ['sugar', '250', 'g'],
      ['tomato', '4', 'pcs'],
      ['olive oil', '3', 'tbsp'],
      ['egg', '4', 'pcs'],
    ]);
    state.plans = [plan('m1', '2026-11-17', 'r1', 'Shakshuka')];

    const out = await executeTool(
      db,
      'u1',
      'addMealPlanShortagesToShoppingList',
      RANGE,
    );
    const added = Object.fromEntries(
      state.shopping.map((r) => [r.name, `${r.quantity} ${r.unit}`]),
    );
    expect(added).toEqual({ sugar: '150 g', egg: '4 pcs' });
    expect(out.cardType).toBe('shopping_list_updated');
    expect(out.cardData).toMatchObject({ itemsAdded: 2 });
  });

  it('is idempotent: a second run adds nothing more', async () => {
    recipe('r1', 'Omelette', [['egg', '4', 'pcs']]);
    state.plans = [plan('m1', '2026-11-17', 'r1', 'Omelette')];
    await executeTool(db, 'u1', 'addMealPlanShortagesToShoppingList', RANGE);
    const second = await executeTool(
      db,
      'u1',
      'addMealPlanShortagesToShoppingList',
      RANGE,
    );
    expect(state.shopping).toHaveLength(1);
    expect(state.shopping[0]).toMatchObject({ quantity: '4', unit: 'pcs' });
    expect(JSON.parse(second.content).skipped).toEqual([
      { name: 'egg', reason: 'already_on_list' },
    ]);
  });

  it('calendar week totals and chat-generated shopping items agree', async () => {
    state.pantry = [pantryRow('p1', 'Eggs', '0', 'pcs')];
    recipe('r1', 'Omelette', [['Egg', '4', 'pcs']]);
    recipe('r2', 'Fried rice', [
      ['egg', '4', 'pcs'],
      ['rice', '300', 'g'],
    ]);
    state.plans = [
      plan('m1', '2026-11-17', 'r1', 'Omelette'),
      plan('m2', '2026-11-18', 'r2', 'Fried rice'),
    ];

    const week = await computeWeekAvailability(db, 'u1', RANGE.from, RANGE.to);
    await executeTool(db, 'u1', 'addMealPlanShortagesToShoppingList', RANGE);

    const calendar = Object.fromEntries(
      week.weekShortages.map((s) => [s.name.toLowerCase(), [s.needed, s.unit]]),
    );
    const chat = Object.fromEntries(
      state.shopping.map((r) => [
        r.name.toLowerCase(),
        [Number(r.quantity), r.unit],
      ]),
    );
    expect(chat).toEqual(calendar);
    expect(chat.egg).toEqual([8, 'pcs']);
  });

  it('links meals saved without a recipe id by name (no "unknown")', async () => {
    recipe('r1', 'Pancakes', [['flour', '200', 'g']]);
    state.plans = [plan('m1', '2026-11-17', null, 'pancakes')];
    const week = await computeWeekAvailability(db, 'u1', RANGE.from, RANGE.to);
    expect(week.meals[0]).toMatchObject({ status: 'short' });
    expect(week.weekShortages).toEqual([
      { name: 'flour', needed: 200, available: 0, unit: 'g' },
    ]);
  });

  it('is a mutating tool so it still requires approval', async () => {
    const { isMutatingTool } = await import('./hitl');
    expect(isMutatingTool('addMealPlanShortagesToShoppingList')).toBe(true);
  });
});
