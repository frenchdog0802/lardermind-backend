import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  createShoppingListItem,
  deleteShoppingListItem,
  getShoppingListItem,
  listShoppingListItems,
  toShoppingListItemDto,
  updateShoppingListItem,
  type ShoppingListItemInput,
  type ShoppingListItemPatch,
} from '../db/shopping-list';

export const shoppingListRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

shoppingListRoutes.use('/api/shopping-list', requireAuth);
shoppingListRoutes.use('/api/shopping-list/*', requireAuth);

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

function parseChecked(raw: unknown): boolean {
  if (raw === true || raw === 1 || raw === '1') return true;
  return false;
}

type ParseResult =
  | { ok: true; value: ShoppingListItemInput }
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

  const checked = parseChecked(pickField(root, details, 'checked'));
  const ingredientRaw = pickField(root, details, 'ingredient_id');

  const value: ShoppingListItemInput = { name, quantity, unit, checked };
  if (typeof ingredientRaw === 'string' && ingredientRaw.trim()) {
    value.ingredient_id = ingredientRaw.trim();
  }
  return { ok: true, value };
}

function parsePatchInput(
  body: unknown,
): { ok: true; value: ShoppingListItemPatch } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const details = asRecord(root.details);
  const patch: ShoppingListItemPatch = {};

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

  const checkedRaw = pickField(root, details, 'checked');
  if (checkedRaw !== undefined) patch.checked = parseChecked(checkedRaw);

  const ingredientRaw = pickField(root, details, 'ingredient_id');
  if (ingredientRaw !== undefined) {
    patch.ingredient_id =
      typeof ingredientRaw === 'string' && ingredientRaw.trim()
        ? ingredientRaw.trim()
        : undefined;
  }

  return { ok: true, value: patch };
}

shoppingListRoutes.get('/api/shopping-list', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('query');
  const rows = await listShoppingListItems(c.env.DB, userId, query);
  return c.json(ok(rows.map(toShoppingListItemDto)));
});

shoppingListRoutes.post('/api/shopping-list', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const row = await createShoppingListItem(c.env.DB, userId, parsed.value);
  return c.json(ok(toShoppingListItemDto(row)), 201);
});

shoppingListRoutes.get('/api/shopping-list/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getShoppingListItem(c.env.DB, userId, c.req.param('id'));
  if (!row) return c.json(fail('Not found'), 404);
  return c.json(ok(toShoppingListItemDto(row)));
});

shoppingListRoutes.put('/api/shopping-list/:id', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parsePatchInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const updated = await updateShoppingListItem(
    c.env.DB,
    userId,
    c.req.param('id'),
    parsed.value,
  );
  if (!updated) return c.json(fail('Not found'), 404);
  return c.json(ok(toShoppingListItemDto(updated)));
});

shoppingListRoutes.delete('/api/shopping-list/:id', async (c) => {
  const userId = c.get('userId');
  const deleted = await deleteShoppingListItem(
    c.env.DB,
    userId,
    c.req.param('id'),
  );
  if (!deleted) return c.json(fail('Not found'), 404);
  return c.json(ok(null));
});
