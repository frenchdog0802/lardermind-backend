import { describe, expect, it } from 'vitest';
import type { MealPlanRow } from '../../db/meal-plan';
import {
  executeTool,
  shortagesToShoppingItems,
} from './execute';
import { listToolNames } from './definitions';
import { argsSummary, isMutatingTool } from './hitl';

function createMealPlanMockDb() {
  const plans = new Map<string, MealPlanRow>();

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (sql.includes('FROM meal_plans') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = plans.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM meal_plans')) {
            const userId = bound[0] as string;
            return {
              results: [...plans.values()].filter(
                (p) => p.user_id === userId,
              ) as T[],
            };
          }
          if (sql.includes('FROM pantry_items')) {
            return { results: [] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO meal_plans')) {
            const [
              id,
              userId,
              mealType,
              servingDate,
              recipeId,
              mealName,
              image,
              status,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string | null,
              string,
              string | null,
              string,
              number,
              number,
            ];
            plans.set(id, {
              id,
              user_id: userId,
              meal_type: mealType,
              serving_date: servingDate,
              recipe_id: recipeId,
              meal_name: mealName,
              image,
              status,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, plans };
}

describe('shortagesToShoppingItems', () => {
  it('maps deficits to shopping inputs', () => {
    expect(
      shortagesToShoppingItems([
        { name: '排骨', needed: 3, available: 0, unit: '包' },
        { name: '  ', needed: 1, available: 0, unit: 'pcs' },
        { name: 'Egg', needed: 0, available: 0, unit: 'pcs' },
      ]),
    ).toEqual([{ name: '排骨', quantity: 3, unit: '包' }]);
  });
});

describe('planMeals + availability tools', () => {
  it('registers planMeals as mutating and availability as read-only', () => {
    const names = listToolNames();
    expect(names).toContain('planMeals');
    expect(names).toContain('getMealPlanAvailability');
    expect(isMutatingTool('planMeals')).toBe(true);
    expect(isMutatingTool('getMealPlanAvailability')).toBe(false);
  });

  it('summarizes planMeals args', () => {
    expect(
      argsSummary('planMeals', {
        meals: [
          {
            meal_name: 'A',
            meal_type: 'dinner',
            serving_date: '2026-10-15',
          },
          {
            meal_name: 'B',
            meal_type: 'dinner',
            serving_date: '2026-10-16',
          },
        ],
      }),
    ).toBe('2 meals (2026-10-15…2026-10-16)');
  });

  it('creates multiple meal plans and returns card', async () => {
    const { db, plans } = createMealPlanMockDb();
    const result = await executeTool(db, 'u1', 'planMeals', {
      meals: [
        {
          meal_name: '山藥排骨湯',
          meal_type: 'dinner',
          serving_date: '2026-10-15',
        },
        {
          meal_name: '酸菜排骨',
          meal_type: 'dinner',
          serving_date: '2026-10-16',
        },
      ],
    });
    expect(result.cardType).toBe('meal_plan_updated');
    const body = JSON.parse(result.content) as {
      created: unknown[];
      errors: unknown[];
      truncated: boolean;
    };
    expect(body.created).toHaveLength(2);
    expect(body.errors).toEqual([]);
    expect(body.truncated).toBe(false);
    expect(plans.size).toBe(2);
    expect(result.cardData?.mealsScheduled).toBe(2);
  });

  it('continues after invalid meal and truncates over 28', async () => {
    const { db } = createMealPlanMockDb();
    const meals = Array.from({ length: 30 }, (_, i) => ({
      meal_name: `Meal ${i}`,
      meal_type: 'dinner',
      serving_date: `2026-10-${String((i % 28) + 1).padStart(2, '0')}`,
    }));
    meals[1] = {
      meal_name: '',
      meal_type: '',
      serving_date: '',
    } as unknown as (typeof meals)[0];

    const result = await executeTool(db, 'u1', 'planMeals', { meals });
    const body = JSON.parse(result.content) as {
      created: unknown[];
      errors: Array<{ index: number }>;
      truncated: boolean;
    };
    expect(body.truncated).toBe(true);
    expect(body.errors.some((e) => e.index === 1)).toBe(true);
    expect(body.created.length).toBeGreaterThan(0);
    expect(body.created.length).toBeLessThanOrEqual(27);
  });

  it('getMealPlanAvailability returns shoppingHints', async () => {
    const { db } = createMealPlanMockDb();
    const result = await executeTool(db, 'u1', 'getMealPlanAvailability', {
      from: '2026-10-15',
      to: '2026-10-21',
    });
    const body = JSON.parse(result.content) as {
      meals: unknown[];
      weekShortages: unknown[];
      shoppingHints: unknown[];
    };
    expect(body.meals).toEqual([]);
    expect(body.weekShortages).toEqual([]);
    expect(body.shoppingHints).toEqual([]);
  });
});
