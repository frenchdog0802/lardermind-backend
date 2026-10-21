import { describe, expect, it } from 'vitest';
import type { PantryItemRow } from '../../db/pantry';
import type { MealPlanRow } from '../../db/meal-plan';
import type { UserPreferencesRow } from '../../db/preferences';
import type { UnitConversionRow } from '../../db/unit-conversions';
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

function defaultPrefs(
  userId: string,
  assumeBasicSeasonings = true,
): UserPreferencesRow {
  return {
    id: `pref-${userId}`,
    user_id: userId,
    household_notes: '',
    measurement_unit: 'metric',
    notes: '',
    allergies_json: '[]',
    dislikes_json: '[]',
    likes_json: '[]',
    dietary_restrictions_json: '[]',
    assume_basic_seasonings: assumeBasicSeasonings ? 1 : 0,
    created_at: 1,
    updated_at: 1,
  };
}

function createSuggestMockDb(opts: {
  pantry: PantryItemRow[];
  recipes: RecipeRow[];
  ingredients: IngRow[];
  plans?: MealPlanRow[];
  preferences?: UserPreferencesRow | null;
  /** When preferences is undefined, create default ON prefs for this user. */
  prefsUserId?: string;
  assumeBasicSeasonings?: boolean;
  conversions?: UnitConversionRow[];
}) {
  const plans = opts.plans ?? [];
  const conversions = opts.conversions ?? [];
  const prefsUserId = opts.prefsUserId ?? 'u1';
  let prefs: UserPreferencesRow | null =
    opts.preferences === undefined
      ? defaultPrefs(prefsUserId, opts.assumeBasicSeasonings ?? true)
      : opts.preferences;

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (sql.includes('FROM user_preferences')) {
            const userId = bound[0] as string;
            if (prefs && prefs.user_id === userId) return prefs as T;
            return null;
          }
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
          if (sql.includes('FROM unit_conversion_table')) {
            const userId = bound[0] as string;
            return {
              results: conversions.filter((c) => c.user_id === userId) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO user_preferences')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            prefs = defaultPrefs(userId, true);
            prefs.id = id;
            return { meta: { changes: 1 } };
          }
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

  it('emits flat client cardData (recipeName / matchScore), not meal_name / sort score', async () => {
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
      ],
      recipes: [
        {
          id: 'r1',
          user_id: 'u1',
          meal_name: '山藥排骨湯',
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
          recipe_id: 'r1',
          name: '排骨',
          quantity: '1',
          unit: '包',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i2',
          recipe_id: 'r1',
          name: '山藥',
          quantity: '1',
          unit: '條',
          ingredient_id: null,
          sort_order: 1,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    expect(result.cardType).toBe('meal_suggestions');
    const suggestions = result.cardData?.suggestions as Array<{
      recipeId?: string;
      recipeName?: string;
      matchScore?: number;
      meal_name?: string;
      score?: number;
      id?: string;
    }>;
    expect(suggestions?.length).toBeGreaterThanOrEqual(1);
    const row = suggestions[0]!;
    expect(row.recipeId).toBe('r1');
    expect(row.recipeName).toBe('山藥排骨湯');
    expect(row.matchScore).toBe(50);
    expect(row.meal_name).toBeUndefined();
    expect(row.score).toBeUndefined();
    expect(row.id).toBeUndefined();
  });
});

describe('suggestMealsFromPantry conditional seasonings (A1–A3)', () => {
  const ribsPantry: PantryItemRow[] = [
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
  ];

  it('A1: seasoning-only missing → conditionally_cookable when assume ON', async () => {
    const db = createSuggestMockDb({
      pantry: ribsPantry,
      assumeBasicSeasonings: true,
      recipes: [
        {
          id: 'r-braise',
          user_id: 'u1',
          meal_name: '紅燒排骨',
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
          recipe_id: 'r-braise',
          name: '排骨',
          quantity: '1',
          unit: '包',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i2',
          recipe_id: 'r-braise',
          name: '醬油',
          quantity: '2',
          unit: '湯匙',
          ingredient_id: null,
          sort_order: 1,
        },
        {
          id: 'i3',
          recipe_id: 'r-braise',
          name: '糖',
          quantity: '1',
          unit: '湯匙',
          ingredient_id: null,
          sort_order: 2,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    const body = JSON.parse(result.content) as {
      assumeBasicSeasonings: boolean;
      conditionallyCookableCount: number;
      suggestions: Array<{
        id: string;
        cookable: boolean;
        cookStatus: string;
        conditionalSeasonings?: string[];
      }>;
    };
    expect(body.assumeBasicSeasonings).toBe(true);
    expect(body.conditionallyCookableCount).toBeGreaterThanOrEqual(1);
    const row = body.suggestions.find((s) => s.id === 'r-braise');
    expect(row?.cookable).toBe(false);
    expect(row?.cookStatus).toBe('conditionally_cookable');
    expect(row?.conditionalSeasonings).toEqual(
      expect.arrayContaining(['醬油', '糖']),
    );
  });

  it('A2: main + seasoning missing → uncookable; missingMains emphasizes main', async () => {
    const db = createSuggestMockDb({
      pantry: ribsPantry,
      assumeBasicSeasonings: true,
      recipes: [
        {
          id: 'r-yam',
          user_id: 'u1',
          meal_name: '山藥排骨湯',
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
          recipe_id: 'r-yam',
          name: '排骨',
          quantity: '1',
          unit: '包',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i2',
          recipe_id: 'r-yam',
          name: '山藥',
          quantity: '1',
          unit: '根',
          ingredient_id: null,
          sort_order: 1,
        },
        {
          id: 'i3',
          recipe_id: 'r-yam',
          name: '鹽',
          quantity: '1',
          unit: '茶匙',
          ingredient_id: null,
          sort_order: 2,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    const body = JSON.parse(result.content) as {
      suggestions: Array<{
        id: string;
        cookable: boolean;
        cookStatus: string;
        missingMains: string[];
        missingIngredients: string[];
      }>;
    };
    const row = body.suggestions.find((s) => s.id === 'r-yam');
    expect(row?.cookable).toBe(false);
    expect(row?.cookStatus).toBe('uncookable');
    expect(row?.missingMains).toContain('山藥');
    expect(row?.missingMains).not.toContain('鹽');
    expect(row?.missingIngredients).toEqual(
      expect.arrayContaining(['山藥', '鹽']),
    );
  });

  it('A3: toggle OFF → seasoning gaps are strict uncookable', async () => {
    const db = createSuggestMockDb({
      pantry: ribsPantry,
      assumeBasicSeasonings: false,
      recipes: [
        {
          id: 'r-braise',
          user_id: 'u1',
          meal_name: '紅燒排骨',
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
          recipe_id: 'r-braise',
          name: '排骨',
          quantity: '1',
          unit: '包',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i2',
          recipe_id: 'r-braise',
          name: '醬油',
          quantity: '2',
          unit: '湯匙',
          ingredient_id: null,
          sort_order: 1,
        },
        {
          id: 'i3',
          recipe_id: 'r-braise',
          name: '糖',
          quantity: '1',
          unit: '湯匙',
          ingredient_id: null,
          sort_order: 2,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    const body = JSON.parse(result.content) as {
      assumeBasicSeasonings: boolean;
      conditionallyCookableCount: number;
      suggestions: Array<{
        id: string;
        cookable: boolean;
        cookStatus: string;
        missingIngredients: string[];
        conditionalSeasonings?: string[];
      }>;
    };
    expect(body.assumeBasicSeasonings).toBe(false);
    expect(body.conditionallyCookableCount).toBe(0);
    const row = body.suggestions.find((s) => s.id === 'r-braise');
    expect(row?.cookStatus).toBe('uncookable');
    expect(row?.cookable).toBe(false);
    expect(row?.missingIngredients).toEqual(
      expect.arrayContaining(['醬油', '糖']),
    );
    expect(row?.conditionalSeasonings).toBeUndefined();
  });

  it('B1: 包↔g mismatch emits define_unit action (not cookable)', async () => {
    const db = createSuggestMockDb({
      pantry: [
        {
          id: 'p1',
          user_id: 'u1',
          name: '排骨',
          quantity: '10',
          unit: '包',
          notes: null,
          ingredient_id: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      recipes: [
        {
          id: 'r-soup',
          user_id: 'u1',
          meal_name: '山藥排骨湯',
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
          recipe_id: 'r-soup',
          name: '排骨',
          quantity: '500',
          unit: 'g',
          ingredient_id: null,
          sort_order: 0,
        },
        {
          id: 'i2',
          recipe_id: 'r-soup',
          name: '山藥',
          quantity: '1',
          unit: '條',
          ingredient_id: null,
          sort_order: 1,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    const body = JSON.parse(result.content) as {
      suggestions: Array<{ id: string; cookable: boolean; cookStatus: string }>;
      actions?: Array<{
        action_required: string;
        item: string;
        from_unit: string;
        to_unit: string;
      }>;
    };
    expect(body.suggestions.some((s) => s.id === 'r-soup')).toBe(true);
    expect(body.suggestions.find((s) => s.id === 'r-soup')?.cookable).toBe(
      false,
    );
    expect(body.actions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action_required: 'define_unit',
          item: '排骨',
          from_unit: '包',
          to_unit: 'g',
        }),
      ]),
    );
    const cardActions = result.cardData?.actions as unknown[];
    expect(cardActions?.length).toBeGreaterThanOrEqual(1);
  });

  it('B2: after ratio stored, 包 stock satisfies g need', async () => {
    const db = createSuggestMockDb({
      pantry: [
        {
          id: 'p1',
          user_id: 'u1',
          name: '排骨',
          quantity: '10',
          unit: '包',
          notes: null,
          ingredient_id: null,
          created_at: 1,
          updated_at: 1,
        },
      ],
      recipes: [
        {
          id: 'r-ribs',
          user_id: 'u1',
          meal_name: '紅燒排骨',
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
          recipe_id: 'r-ribs',
          name: '排骨',
          quantity: '500',
          unit: 'g',
          ingredient_id: null,
          sort_order: 0,
        },
      ],
      conversions: [
        {
          id: 'c1',
          user_id: 'u1',
          item_name: '排骨',
          base_unit: '包',
          target_unit: 'g',
          ratio: 500,
          created_at: 1,
          updated_at: 1,
        },
      ],
    });

    const result = await executeTool(db, 'u1', 'suggestMealsFromPantry', {});
    const body = JSON.parse(result.content) as {
      suggestions: Array<{
        id: string;
        cookable: boolean;
        cookStatus: string;
      }>;
      actions?: unknown[];
    };
    const row = body.suggestions.find((s) => s.id === 'r-ribs');
    expect(row?.cookable).toBe(true);
    expect(row?.cookStatus).toBe('cookable');
    expect(body.actions ?? []).toHaveLength(0);
  });
});
