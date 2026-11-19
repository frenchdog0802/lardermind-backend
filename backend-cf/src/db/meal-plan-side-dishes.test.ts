import { describe, expect, it } from 'vitest';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { createRecipe } from './recipe';
import {
  createMealPlan,
  EmptyMealNameError,
  listMealPlans,
  updateMealPlan,
} from './meal-plan';
import { executeTool } from '../agent/tools/execute';

const U = 'u1';

function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${U}', 'A', 'B', 'A B', 'a@x.com', 'g1')`,
  );
  return h;
}

describe('meal plan: never save an empty meal_name', () => {
  it('falls back to the linked recipe name', async () => {
    const { db } = setup();
    const r = await createRecipe(db, U, {
      meal_name: '排骨炒時蔬',
      instructions: [],
      ingredients: [],
    });
    const row = await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-19',
      recipe_id: r.id,
      meal_name: '  ',
    });
    expect(row.meal_name).toBe('排骨炒時蔬');
  });

  it('rejects a blank name with no resolvable recipe', async () => {
    const { db } = setup();
    await expect(
      createMealPlan(db, U, { meal_type: 'dinner', serving_date: '2026-11-19' }),
    ).rejects.toBeInstanceOf(EmptyMealNameError);
    await expect(
      createMealPlan(db, U, {
        meal_type: 'dinner',
        serving_date: '2026-11-19',
        recipe_id: 'missing',
      }),
    ).rejects.toBeInstanceOf(EmptyMealNameError);
    expect(await listMealPlans(db, U)).toHaveLength(0);
  });

  it('update cannot blank a name; legacy blank rows still accept unrelated edits', async () => {
    const { db, sqlite } = setup();
    const row = await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-19',
      meal_name: 'Soup',
    });
    await expect(
      updateMealPlan(db, U, row.id, { meal_name: '' }),
    ).rejects.toBeInstanceOf(EmptyMealNameError);
    sqlite.exec(
      `INSERT INTO meal_plans (id, user_id, meal_type, serving_date, meal_name, status) VALUES ('legacy', '${U}', 'dinner', '2026-11-19', '', 'PLANNED')`,
    );
    const cancelled = await updateMealPlan(db, U, 'legacy', { status: 'CANCELLED' });
    expect(cancelled?.status).toBe('CANCELLED');
  });
});

describe('meal plan: several dishes per day + meal_type', () => {
  it('planMeals saves a main and a side on the same day as separate rows', async () => {
    const { db } = setup();
    const res = await executeTool(db, U, 'planMeals', {
      meals: [
        { meal_name: '排骨香菇玉米湯', meal_type: 'dinner', serving_date: '2026-11-19' },
        { meal_name: '蒜炒青花菜', meal_type: 'dinner', serving_date: '2026-11-19' },
        { meal_name: '紅燒排骨', meal_type: 'dinner', serving_date: '2026-11-20' },
        { meal_name: '燙高麗菜', meal_type: 'dinner', serving_date: '2026-11-20' },
      ],
    });
    const body = JSON.parse(res.content) as {
      created: unknown[];
      errors: unknown[];
      savedBySlot: Record<string, string[]>;
    };
    expect(body.errors).toEqual([]);
    expect(body.created).toHaveLength(4);
    expect(body.savedBySlot['2026-11-19 dinner']).toEqual(['排骨香菇玉米湯', '蒜炒青花菜']);
    expect(body.savedBySlot['2026-11-20 dinner']).toEqual(['紅燒排骨', '燙高麗菜']);
    const rows = await listMealPlans(db, U);
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => r.meal_name.trim() !== '')).toBe(true);
  });

  it('addRecipeToMenu with no name and no recipe saves nothing', async () => {
    const { db } = setup();
    const res = await executeTool(db, U, 'addRecipeToMenu', {
      meal_type: 'dinner',
      serving_date: '2026-11-19',
      recipe_id: 'stale-id',
    });
    expect(JSON.parse(res.content).error).toMatch(/meal_name is required/);
    expect(await listMealPlans(db, U)).toHaveLength(0);
  });
});
