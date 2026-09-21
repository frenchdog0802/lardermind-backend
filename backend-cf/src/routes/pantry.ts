import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  createPantryItem,
  deletePantryItem,
  findByIngredientId,
  findByNameCi,
  getPantryItem,
  listPantryItems,
  toPantryItemDto,
  updatePantryItem,
  type PantryItemInput,
  type PantryItemPatch,
} from '../db/pantry';

export const pantryRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

pantryRoutes.use('/api/pantry-item/*', requireAuth);
pantryRoutes.use('/api/pantry-item', requireAuth);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function pickField(
  body: LooseRecord,
  details: LooseRecord | null,
  key: string,
): unknown {
  if (body[key] !== undefined && body[key] !== null) return body[key];
  if (details && details[key] !== undefined && details[key] !== null) {
    return details[key];
  }
  return undefined;
}

function parseQuantity(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

type ParseResult =
  | { ok: true; value: PantryItemInput }
  | { ok: false; message: string };

function parseCreateInput(body: unknown): ParseResult {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const details = asRecord(root.details);

  const nameRaw = pickField(root, details, 'name');
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  if (!name) return { ok: false, message: 'Name is required' };

  const quantity = parseQuantity(pickField(root, details, 'quantity'));
  if (quantity === null) return { ok: false, message: 'Invalid quantity' };

  const unitRaw = pickField(root, details, 'unit');
  const unit =
    typeof unitRaw === 'string' && unitRaw.trim() ? unitRaw.trim() : 'pcs';

  const notesRaw = pickField(root, details, 'notes');
  const ingredientRaw = pickField(root, details, 'ingredient_id');

  const value: PantryItemInput = { name, quantity, unit };
  if (typeof notesRaw === 'string') value.notes = notesRaw;
  if (typeof ingredientRaw === 'string' && ingredientRaw.trim()) {
    value.ingredient_id = ingredientRaw.trim();
  }
  return { ok: true, value };
}

function parsePatchInput(body: unknown): { ok: true; value: PantryItemPatch } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const details = asRecord(root.details);
  const patch: PantryItemPatch = {};

  const nameRaw = pickField(root, details, 'name');
  if (nameRaw !== undefined) {
    if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
      return { ok: false, message: 'Name is required' };
    }
    patch.name = nameRaw.trim();
  }

  const qtyRaw = pickField(root, details, 'quantity');
  if (qtyRaw !== undefined) {
    const quantity = parseQuantity(qtyRaw);
    if (quantity === null) return { ok: false, message: 'Invalid quantity' };
    patch.quantity = quantity;
  }

  const unitRaw = pickField(root, details, 'unit');
  if (unitRaw !== undefined) {
    patch.unit =
      typeof unitRaw === 'string' && unitRaw.trim() ? unitRaw.trim() : 'pcs';
  }

  const notesRaw = pickField(root, details, 'notes');
  if (notesRaw !== undefined) {
    patch.notes = typeof notesRaw === 'string' ? notesRaw : undefined;
  }

  const ingredientRaw = pickField(root, details, 'ingredient_id');
  if (ingredientRaw !== undefined) {
    patch.ingredient_id =
      typeof ingredientRaw === 'string' && ingredientRaw.trim()
        ? ingredientRaw.trim()
        : undefined;
  }

  return { ok: true, value: patch };
}

pantryRoutes.get('/api/pantry-item', async (c) => {
  const userId = c.get('userId');
  const rows = await listPantryItems(c.env.DB, userId);
  return c.json(ok(rows.map(toPantryItemDto)));
});

pantryRoutes.post('/api/pantry-item', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const row = await createPantryItem(c.env.DB, userId, parsed.value);
  return c.json(ok(toPantryItemDto(row)), 201);
});

pantryRoutes.post('/api/pantry-item/bulk', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const root = asRecord(body);
  const items = root && Array.isArray(root.items) ? root.items : null;
  if (!items || items.length === 0) {
    return c.json(fail('items required'), 400);
  }

  const created = [];
  for (const item of items) {
    const parsed = parseCreateInput(item);
    if (!parsed.ok) return c.json(fail(parsed.message), 400);
    const row = await createPantryItem(c.env.DB, userId, parsed.value);
    created.push(toPantryItemDto(row));
  }
  return c.json(ok(created), 201);
});

pantryRoutes.put('/api/pantry-item/bulk', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const root = asRecord(body);
  const items = root && Array.isArray(root.items) ? root.items : null;
  if (!items || items.length === 0) {
    return c.json(fail('items required'), 400);
  }

  const results = [];
  for (const item of items) {
    const itemRoot = asRecord(item);
    if (!itemRoot) return c.json(fail('Invalid body'), 400);
    const details = asRecord(itemRoot.details);
    const idRaw = pickField(itemRoot, details, 'id');
    const id = typeof idRaw === 'string' && idRaw.trim() ? idRaw.trim() : '';

    const patchParsed = parsePatchInput(item);
    if (!patchParsed.ok) return c.json(fail(patchParsed.message), 400);
    const patch = patchParsed.value;

    let targetId: string | null = null;
    if (id) {
      const byId = await getPantryItem(c.env.DB, userId, id);
      if (byId) targetId = byId.id;
    }
    if (!targetId && patch.ingredient_id) {
      const byIng = await findByIngredientId(
        c.env.DB,
        userId,
        patch.ingredient_id,
      );
      if (byIng) targetId = byIng.id;
    }
    if (!targetId && patch.name) {
      const byName = await findByNameCi(c.env.DB, userId, patch.name);
      if (byName) targetId = byName.id;
    }

    if (targetId) {
      const updated = await updatePantryItem(c.env.DB, userId, targetId, patch);
      if (!updated) return c.json(fail('Not found'), 404);
      results.push(toPantryItemDto(updated));
      continue;
    }

    const createParsed = parseCreateInput(item);
    if (!createParsed.ok) return c.json(fail(createParsed.message), 400);
    const created = await createPantryItem(c.env.DB, userId, createParsed.value);
    results.push(toPantryItemDto(created));
  }

  return c.json(ok(results));
});

pantryRoutes.get('/api/pantry-item/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getPantryItem(c.env.DB, userId, c.req.param('id'));
  if (!row) return c.json(fail('Not found'), 404);
  return c.json(ok(toPantryItemDto(row)));
});

pantryRoutes.put('/api/pantry-item/:id', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parsePatchInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const updated = await updatePantryItem(
    c.env.DB,
    userId,
    c.req.param('id'),
    parsed.value,
  );
  if (!updated) return c.json(fail('Not found'), 404);
  return c.json(ok(toPantryItemDto(updated)));
});

pantryRoutes.delete('/api/pantry-item/:id', async (c) => {
  const userId = c.get('userId');
  const deleted = await deletePantryItem(c.env.DB, userId, c.req.param('id'));
  if (!deleted) return c.json(fail('Not found'), 404);
  return c.json(ok(null));
});
