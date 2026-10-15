import { describe, expect, it } from 'vitest';
import type { PantryItemRow } from '../../db/pantry';
import type { MealPlanRow } from '../../db/meal-plan';
import { executeTool } from './execute';

type RecipeRow = {
  id: string;
  user_id: string;
  meal_name: string;
  instructions: string;
  image_url: string | null;
  image_public_id: string | null;
  folder_id: string | null;
  created_at: number;
  updated_at: number;
};

type IngRow = {
  id: string;
  recipe_id: string;
  name: string;
  quantity: string;
  unit: string;
  ingredient_id: string | null;
  sort_order: number;
};

function createSuggestMockDb(opts: {
  pantry: PantryItemRow[];
  recipes: RecipeRow[];
  ingredients: IngRow[];
  plans?: MealPlanRow[];
}) {
  const plans = opts.plans ?? [];
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (sql.includes('FROM recipes') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = opts.recipes.find(
              (r) => r.id === id && r.user_id === userId,
            );
            return (row as T) ?? null;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM pantry_items')) {
            const userId = bound[0] as string;
            return {
              results: opts.pantry.filter((p) => p.user_id === userId) as T[],
            };
          }
          if (sql.includes('FROM meal_plans')) {
            const userId = bound[0] as string;
            return {
              results: plans.filter((p) => p.user_id === userId) as T[],
            };
          }
          if (sql.includes('FROM recipes')) {
            const userId = bound[0] as string;
            return {
              results: opts.recipes.filter((r) => r.user_id === userId) as T[],
            };
          }
          if (sql.includes('recipe_ingredients')) {
            const recipeId = bound[0] as string;
            return {
              results: opts.ingredients.filter(
                (i) => i.recipe_id === recipeId,
              ) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
    },
  };
  return db as unknown as D1Database;
}

describe('suggestMealsFromPantry cookable scoring', () => {
  it('prefers fully cookable recipes given available stock', async () => {
    const db = createSuggestMockDb({
      pantry: [
        {
          id: 'p1',
          user_id: 'u1',
          name: '排骨',
          quantity: '2',
          unit: '包',
          notes: null,
          ingredient_id: null,
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 'p2',
          user_id: 'u1',
          name: '山藥',
          quantity: '1',
          unit: '根',
          notes: null,
          ingredient_id: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      recipes: [
        {
          id: 'r-ok',
          user_id: 'u1',
          meal_name: '山藥排骨湯',
          instructions: '煮',
          image_url: null,
          image_public_id: null,
          folder_id: null,
          created_at: 1,
          updated_at: 1,
        },
        {
          id: 'r-short',
          user_id: 'u1',
          meal_name: '豪華排骨大餐',
          instructions: '煮',
          image_url: null,
          image_public_id: null,
          folder_id: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      ingredients: [
        {
          id: 'i1',
          recipe_id: 'r-ok',
          name: '排骨',
          quantity: '1',
          unit: '包',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i2',
          recipe_id: 'r-ok',
          name: '山藥',
          quantity: '1',
          unit: '根',
          ingredient_id: null,
          sort_order: 1,
        },
        {
          id: 'i3',
          recipe_id: 'r-short',
          name: '排骨',
          quantity: '1',
          unit: '包',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i4',
          recipe_id: 'r-short',
          name: '松露',
          quantity: '1',
          unit: '盒',
          ingredient_id: null,
          sort_order: 1,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    const body = JSON.parse(result.content) as {
      suggestions: Array<{ id: string; cookable: boolean }>;
      cookableCount: number;
    };
    expect(body.suggestions[0]?.id).toBe('r-ok');
    expect(body.suggestions[0]?.cookable).toBe(true);
    expect(body.cookableCount).toBeGreaterThanOrEqual(1);
    const short = body.suggestions.find((s) => s.id === 'r-short');
    expect(short?.cookable).toBe(false);
  });
});
