import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { signJwt } from '../lib/jwt';
import { mealPlanRoutes } from './meal-plan';
import { createRecipe } from '../db/recipe';
import {
  createMealPlan,
  getMealPlan,
  listMealPlans,
  MealPlanValidationError,
  updateMealPlan,
} from '../db/meal-plan';
import { executeTool } from '../agent/tools/execute';
import type { Env } from '../env';

const JWT_SECRET = 'x'.repeat(32);
const U = 'u-name-1';
const OTHER = 'u-name-2';

function setup() {
  const h = createSqliteD1();
  for (const [id, email, g] of [
    [U, 'a@x.com', 'g1'],
    [OTHER, 'b@x.com', 'g2'],
  ]) {
    h.sqlite.exec(
      `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${id}', 'A', 'B', 'A B', '${email}', '${g}')`,
    );
  }
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', mealPlanRoutes);
  const env = { DB: h.db, JWT_SECRET } as unknown as Env;
  return { ...h, app, env };
}

async function headers(userId = U) {
  const token = await signJwt(userId, JWT_SECRET, 3600);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

describe('meal plans never store an empty meal_name', () => {
  it('POST with only recipe_id (chat card add-to-dinner) takes the recipe name', async () => {
    const { app, env, db } = setup();
    const recipe = await createRecipe(db, U, {
      meal_name: 'Garlic Spinach',
      instructions: [],
      ingredients: [],
    });
    const res = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers: await headers(),
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-11-20',
          recipe_id: recipe.id,
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { meal_name: string; recipe_id: string } };
    expect(body.data.meal_name).toBe('Garlic Spinach');
    expect(body.data.recipe_id).toBe(recipe.id);
  });

  it('POST with blank name and no / foreign / unknown recipe is a 400 validation_error and writes nothing', async () => {
    const { app, env, db } = setup();
    const foreign = await createRecipe(db, OTHER, {
      meal_name: 'Not yours',
      instructions: [],
      ingredients: [],
    });
    for (const extra of [
      {},
      { meal_name: '   ' },
      { recipe_id: 'does-not-exist' },
      { recipe_id: foreign.id, meal_name: '' },
    ]) {
      const res = await app.request(
        '/api/meal-plan',
        {
          method: 'POST',
          headers: await headers(),
          body: JSON.stringify({
            meal_type: 'dinner',
            serving_date: '2026-11-20',
            ...extra,
          }),
        },
        env,
      );
      expect(res.status).toBe(400);
      const body = (await res.json()) as { success: boolean; code: string; message: string };
      expect(body.success).toBe(false);
      expect(body.code).toBe('validation_error');
      expect(body.message).toMatch(/meal_name is required/);
    }
    expect(await listMealPlans(db, U)).toHaveLength(0);
  });

  it('PUT with blank meal_name resolves from the recipe or is rejected; other patches leave the row alone', async () => {
    const { app, env, db, sqlite } = setup();
    const recipe = await createRecipe(db, U, {
      meal_name: 'Tomato Egg',
      instructions: [],
      ingredients: [],
    });
    const linked = await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-20',
      recipe_id: recipe.id,
      meal_name: 'Old name',
    });
    const put1 = await app.request(
      `/api/meal-plan/${linked.id}`,
      { method: 'PUT', headers: await headers(), body: JSON.stringify({ meal_name: '' }) },
      env,
    );
    expect(put1.status).toBe(200);
    expect(((await put1.json()) as { data: { meal_name: string } }).data.meal_name).toBe(
      'Tomato Egg',
    );

    const unlinked = await createMealPlan(db, U, {
      meal_type: 'lunch',
      serving_date: '2026-11-21',
      meal_name: 'Soup',
    });
    const put2 = await app.request(
      `/api/meal-plan/${unlinked.id}`,
      { method: 'PUT', headers: await headers(), body: JSON.stringify({ meal_name: ' ' }) },
      env,
    );
    expect(put2.status).toBe(400);
    expect(((await put2.json()) as { code: string }).code).toBe('validation_error');
    expect((await getMealPlan(db, U, unlinked.id))?.meal_name).toBe('Soup');

    // A legacy nameless row (written before this fix) is not rewritten by
    // unrelated patches such as a status change.
    sqlite.exec(
      `INSERT INTO meal_plans (id, user_id, meal_type, serving_date, recipe_id, meal_name, status) VALUES ('legacy', '${U}', 'dinner', '2026-11-22', NULL, '', 'PLANNED')`,
    );
    const put3 = await app.request(
      `/api/meal-plan/legacy`,
      { method: 'PUT', headers: await headers(), body: JSON.stringify({ status: 'SKIPPED' }) },
      env,
    );
    expect(put3.status).toBe(200);
    expect((await getMealPlan(db, U, 'legacy'))?.meal_name).toBe('');
  });

  it('db layer throws MealPlanValidationError (create and update)', async () => {
    const { db } = setup();
    await expect(
      createMealPlan(db, U, { meal_type: 'dinner', serving_date: '2026-11-20' }),
    ).rejects.toBeInstanceOf(MealPlanValidationError);
    const row = await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-20',
      meal_name: 'Rice',
    });
    await expect(updateMealPlan(db, U, row.id, { meal_name: '' })).rejects.toBeInstanceOf(
      MealPlanValidationError,
    );
  });

  it('addRecipeToMenu with an invented recipe_id and no name returns an error and writes nothing', async () => {
    const { db } = setup();
    const result = await executeTool(db, U, 'addRecipeToMenu', {
      recipe_id: 'hallucinated-id',
      meal_type: 'dinner',
      serving_date: '2026-11-20',
    });
    expect(result.cardType).toBeUndefined();
    expect(JSON.parse(result.content).error).toMatch(/meal_name is required/);
    expect(await listMealPlans(db, U)).toHaveLength(0);
  });

  it('addRecipeToMenu / planMeals with a real recipe_id and no name use the recipe name', async () => {
    const { db } = setup();
    const recipe = await createRecipe(db, U, {
      meal_name: 'Braised Pork',
      instructions: [],
      ingredients: [],
    });
    const one = await executeTool(db, U, 'addRecipeToMenu', {
      recipe_id: recipe.id,
      meal_type: 'dinner',
      serving_date: '2026-11-20',
    });
    expect(JSON.parse(one.content).plan.meal_name).toBe('Braised Pork');
    const many = await executeTool(db, U, 'planMeals', {
      meals: [
        { recipe_id: recipe.id, meal_name: '', meal_type: 'dinner', serving_date: '2026-11-21' },
        { recipe_id: 'nope', meal_name: '', meal_type: 'dinner', serving_date: '2026-11-22' },
      ],
    });
    const parsed = JSON.parse(many.content);
    expect(parsed.created.map((c: { meal_name: string }) => c.meal_name)).toEqual([
      'Braised Pork',
    ]);
    expect(parsed.errors).toHaveLength(1);
    const names = (await listMealPlans(db, U)).map((p) => p.meal_name);
    expect(names.every((n) => n.trim().length > 0)).toBe(true);
  });
});
