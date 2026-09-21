import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  createIngredient,
  deleteIngredient,
  getIngredient,
  listIngredients,
  toIngredientDto,
  updateIngredient,
  type IngredientInput,
  type IngredientPatch,
} from '../db/ingredient';

export const ingredientRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

ingredientRoutes.use('/api/ingredient', requireAuth);
ingredientRoutes.use('/api/ingredient/*', requireAuth);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function parseCreateInput(
  body: unknown,
): { ok: true; value: IngredientInput } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const name = typeof root.name === 'string' ? root.name.trim() : '';
  if (!name) return { ok: false, message: 'Name is required' };

  const value: IngredientInput = { name };
  if (typeof root.default_unit === 'string' && root.default_unit.trim()) {
    value.default_unit = root.default_unit.trim();
  }
  if (typeof root.unit_kind === 'string') value.unit_kind = root.unit_kind;
  if (typeof root.base_unit === 'string') value.base_unit = root.base_unit;
  if (typeof root.default_display_unit === 'string') {
    value.default_display_unit = root.default_display_unit;
  }
  if (typeof root.kind_locked === 'boolean') {
    value.kind_locked = root.kind_locked;
  }
  if (typeof root.image_url === 'string') value.image_url = root.image_url;
  return { ok: true, value };
}

function parsePatchInput(
  body: unknown,
): { ok: true; value: IngredientPatch } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const patch: IngredientPatch = {};

  if (root.name !== undefined) {
    if (typeof root.name !== 'string' || !root.name.trim()) {
      return { ok: false, message: 'Name is required' };
    }
    patch.name = root.name.trim();
  }
  if (root.default_unit !== undefined) {
    patch.default_unit =
      typeof root.default_unit === 'string' && root.default_unit.trim()
        ? root.default_unit.trim()
        : 'pcs';
  }
  if (root.unit_kind !== undefined) {
    patch.unit_kind = typeof root.unit_kind === 'string' ? root.unit_kind : undefined;
  }
  if (root.base_unit !== undefined) {
    patch.base_unit =
      typeof root.base_unit === 'string' ? root.base_unit : undefined;
  }
  if (root.default_display_unit !== undefined) {
    patch.default_display_unit =
      typeof root.default_display_unit === 'string'
        ? root.default_display_unit
        : undefined;
  }
  if (root.kind_locked !== undefined) {
    patch.kind_locked = Boolean(root.kind_locked);
  }
  if (root.image_url !== undefined) {
    patch.image_url =
      typeof root.image_url === 'string' ? root.image_url : undefined;
  }

  return { ok: true, value: patch };
}

ingredientRoutes.get('/api/ingredient', async (c) => {
  const userId = c.get('userId');
  const rows = await listIngredients(c.env.DB, userId, c.req.query('query'));
  return c.json(ok(rows.map(toIngredientDto)));
});

ingredientRoutes.post('/api/ingredient', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const row = await createIngredient(c.env.DB, userId, parsed.value);
  return c.json(ok(toIngredientDto(row)), 201);
});

ingredientRoutes.get('/api/ingredient/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getIngredient(c.env.DB, userId, c.req.param('id'));
  if (!row) return c.json(fail('Not found'), 404);
  return c.json(ok(toIngredientDto(row)));
});

ingredientRoutes.put('/api/ingredient/:id', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parsePatchInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const updated = await updateIngredient(
    c.env.DB,
    userId,
    c.req.param('id'),
    parsed.value,
  );
  if (!updated) return c.json(fail('Not found'), 404);
  return c.json(ok(toIngredientDto(updated)));
});

ingredientRoutes.delete('/api/ingredient/:id', async (c) => {
  const userId = c.get('userId');
  const deleted = await deleteIngredient(c.env.DB, userId, c.req.param('id'));
  if (!deleted) return c.json(fail('Not found'), 404);
  return c.json(ok(null));
});
