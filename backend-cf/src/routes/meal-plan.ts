import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  confirmMealPlan,
  createMealPlan,
  deleteMealPlan,
  getMealPlan,
  listMealPlans,
  listPendingConfirmMealPlans,
  skipMealPlan,
  toMealPlanDto,
  updateMealPlan,
  type MealPlanInput,
  type MealPlanPatch,
} from '../db/meal-plan';

export const mealPlanRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

mealPlanRoutes.use('/api/meal-plan', requireAuth);
mealPlanRoutes.use('/api/meal-plan/*', requireAuth);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function parseCreateInput(
  body: unknown,
): { ok: true; value: MealPlanInput } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };

  const mealType =
    typeof root.meal_type === 'string' ? root.meal_type.trim() : '';
  if (!mealType) return { ok: false, message: 'meal_type is required' };

  const servingDate =
    typeof root.serving_date === 'string' ? root.serving_date.trim() : '';
  if (!servingDate) return { ok: false, message: 'serving_date is required' };

  const value: MealPlanInput = { meal_type: mealType, serving_date: servingDate };
  if (typeof root.recipe_id === 'string' && root.recipe_id.trim()) {
    value.recipe_id = root.recipe_id.trim();
  }
  if (typeof root.meal_name === 'string') value.meal_name = root.meal_name;
  if (typeof root.image === 'string' || root.image === null) {
    value.image = root.image as string | null;
  }
  if (typeof root.status === 'string') value.status = root.status;
  return { ok: true, value };
}

function parsePatchInput(
  body: unknown,
): { ok: true; value: MealPlanPatch } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const patch: MealPlanPatch = {};

  if (root.meal_type !== undefined) {
    if (typeof root.meal_type !== 'string' || !root.meal_type.trim()) {
      return { ok: false, message: 'meal_type is required' };
    }
    patch.meal_type = root.meal_type.trim();
  }
  if (root.serving_date !== undefined) {
    if (typeof root.serving_date !== 'string' || !root.serving_date.trim()) {
      return { ok: false, message: 'serving_date is required' };
    }
    patch.serving_date = root.serving_date.trim();
  }
  if (root.recipe_id !== undefined) {
    patch.recipe_id =
      typeof root.recipe_id === 'string' ? root.recipe_id.trim() : '';
  }
  if (root.meal_name !== undefined) {
    patch.meal_name =
      typeof root.meal_name === 'string' ? root.meal_name : '';
  }
  if (root.image !== undefined) {
    patch.image =
      typeof root.image === 'string' || root.image === null
        ? (root.image as string | null)
        : null;
  }
  if (root.status !== undefined && typeof root.status === 'string') {
    patch.status = root.status;
  }

  return { ok: true, value: patch };
}

mealPlanRoutes.get('/api/meal-plan/pending-confirm', async (c) => {
  const userId = c.get('userId');
  const rows = await listPendingConfirmMealPlans(c.env.DB, userId);
  return c.json(ok(rows.map(toMealPlanDto)));
});

mealPlanRoutes.post('/api/meal-plan/:id/confirm', async (c) => {
  const userId = c.get('userId');
  const result = await confirmMealPlan(c.env.DB, userId, c.req.param('id'));
  if (!result) return c.json(fail('Not found'), 404);
  return c.json(ok(result));
});

mealPlanRoutes.post('/api/meal-plan/:id/skip', async (c) => {
  const userId = c.get('userId');
  const result = await skipMealPlan(c.env.DB, userId, c.req.param('id'));
  if (!result) return c.json(fail('Not found'), 404);
  return c.json(ok(result));
});

mealPlanRoutes.get('/api/meal-plan', async (c) => {
  const userId = c.get('userId');
  const rows = await listMealPlans(c.env.DB, userId, c.req.query('query'));
  return c.json(ok(rows.map(toMealPlanDto)));
});

mealPlanRoutes.post('/api/meal-plan', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const row = await createMealPlan(c.env.DB, userId, parsed.value);
  return c.json(ok(toMealPlanDto(row)), 201);
});

mealPlanRoutes.get('/api/meal-plan/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getMealPlan(c.env.DB, userId, c.req.param('id'));
  if (!row) return c.json(fail('Not found'), 404);
  return c.json(ok(toMealPlanDto(row)));
});

mealPlanRoutes.put('/api/meal-plan/:id', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parsePatchInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const updated = await updateMealPlan(
    c.env.DB,
    userId,
    c.req.param('id'),
    parsed.value,
  );
  if (!updated) return c.json(fail('Not found'), 404);
  return c.json(ok(toMealPlanDto(updated)));
});

mealPlanRoutes.delete('/api/meal-plan/:id', async (c) => {
  const userId = c.get('userId');
  const deleted = await deleteMealPlan(c.env.DB, userId, c.req.param('id'));
  if (!deleted) return c.json(fail('Not found'), 404);
  return c.json(ok(null));
});
