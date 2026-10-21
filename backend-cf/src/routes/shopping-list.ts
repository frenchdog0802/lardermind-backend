import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireNonGuest } from '../middleware/auth';
import {
  assertBatchSize,
  mergeAddShoppingListItem,
  deleteShoppingListItem,
  getShoppingListItem,
  listShoppingListItems,
  syncItemsToPantry,
  toShoppingListItemDto,
  unsyncItemsFromPantry,
  updateShoppingListItem,
  type ShoppingListItemInput,
  type ShoppingListItemPatch,
  type SyncToPantryItemInput,
} from '../db/shopping-list';

export const shoppingListRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

shoppingListRoutes.use('/api/shopping-list', requireAuth, requireNonGuest);
shoppingListRoutes.use('/api/shopping-list/*', requireAuth, requireNonGuest);

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

function parseSyncToPantryBody(
  body: unknown,
):
  | { ok: true; value: SyncToPantryItemInput[] }
  | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  if (!Array.isArray(root.items)) {
    return { ok: false, message: 'items is required' };
  }
  const sizeError = assertBatchSize(root.items.length);
  if (sizeError) return { ok: false, message: sizeError };

  const items: SyncToPantryItemInput[] = [];
  for (const raw of root.items) {
    const rec = asRecord(raw);
    if (!rec || typeof rec.id !== 'string' || !rec.id.trim()) {
      return { ok: false, message: 'Each item requires id' };
    }
    const entry: SyncToPantryItemInput = { id: rec.id.trim() };
    if (rec.quantity !== undefined) {
      const quantity = parseQuantity(rec.quantity);
      if (quantity === null) {
        return { ok: false, message: 'Invalid quantity' };
      }
      entry.quantity = quantity;
    }
    if (rec.unit !== undefined) {
      entry.unit =
        typeof rec.unit === 'string' && rec.unit.trim()
          ? rec.unit.trim()
          : 'pcs';
    }
    items.push(entry);
  }
  return { ok: true, value: items };
}

function parseUnsyncBody(
  body: unknown,
): { ok: true; value: string[] } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  if (!Array.isArray(root.item_ids)) {
    return { ok: false, message: 'item_ids is required' };
  }
  const sizeError = assertBatchSize(root.item_ids.length);
  if (sizeError) return { ok: false, message: sizeError };

  const ids: string[] = [];
  for (const raw of root.item_ids) {
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, message: 'Each item_id must be a non-empty string' };
    }
    ids.push(raw.trim());
  }
  return { ok: true, value: ids };
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

  const { item: row } = await mergeAddShoppingListItem(
    c.env.DB,
    userId,
    parsed.value,
  );
  return c.json(ok(toShoppingListItemDto(row)), 201);
});

shoppingListRoutes.post('/api/shopping-list/sync-to-pantry', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseSyncToPantryBody(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const result = await syncItemsToPantry(c.env.DB, userId, parsed.value);
  return c.json(ok(result));
});

shoppingListRoutes.post('/api/shopping-list/unsync-from-pantry', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseUnsyncBody(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const result = await unsyncItemsFromPantry(c.env.DB, userId, parsed.value);
  return c.json(ok(result));
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
