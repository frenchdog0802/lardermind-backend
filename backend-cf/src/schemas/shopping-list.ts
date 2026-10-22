import { z } from 'zod';
import type {
  ShoppingListItemInput,
  ShoppingListItemPatch,
  SyncToPantryItemInput,
} from '../db/shopping-list';

const looseQuantity = z.union([z.number(), z.string()]).nullish();
const looseChecked = z.union([z.boolean(), z.number(), z.string()]).nullish();

const detailsSchema = z
  .object({
    name: z.string().nullish(),
    quantity: looseQuantity,
    unit: z.string().nullish(),
    checked: looseChecked,
    ingredient_id: z.string().nullish(),
    version: z.number().int().nonnegative().nullish(),
  })
  .passthrough();

export const shoppingWriteBodySchema = z
  .object({
    name: z.string().nullish(),
    quantity: looseQuantity,
    unit: z.string().nullish(),
    checked: looseChecked,
    ingredient_id: z.string().nullish(),
    version: z.number().int().nonnegative().nullish(),
    details: detailsSchema.nullish(),
  })
  .passthrough();

export type ShoppingWriteBody = z.infer<typeof shoppingWriteBodySchema>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function pickField(
  body: ShoppingWriteBody,
  key: 'name' | 'quantity' | 'unit' | 'checked' | 'ingredient_id' | 'version',
): unknown {
  const direct = body[key];
  if (direct !== undefined && direct !== null) return direct;
  const details = asRecord(body.details);
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

export function normalizeShoppingCreate(
  body: ShoppingWriteBody,
): { ok: true; value: ShoppingListItemInput } | { ok: false; message: string } {
  const nameRaw = pickField(body, 'name');
  const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
  if (!name) return { ok: false, message: 'Name is required' };

  const quantity = parseQuantity(pickField(body, 'quantity'));
  if (quantity === null) return { ok: false, message: 'Invalid quantity' };

  const unitRaw = pickField(body, 'unit');
  const unit =
    typeof unitRaw === 'string' && unitRaw.trim() ? unitRaw.trim() : 'pcs';

  const checked = parseChecked(pickField(body, 'checked'));
  const ingredientRaw = pickField(body, 'ingredient_id');
  const value: ShoppingListItemInput = { name, quantity, unit, checked };
  if (typeof ingredientRaw === 'string' && ingredientRaw.trim()) {
    value.ingredient_id = ingredientRaw.trim();
  }
  return { ok: true, value };
}

export function normalizeShoppingPatch(
  body: ShoppingWriteBody,
):
  | { ok: true; value: ShoppingListItemPatch }
  | { ok: false; message: string } {
  const patch: ShoppingListItemPatch = {};

  const nameRaw = pickField(body, 'name');
  if (nameRaw !== undefined) {
    if (typeof nameRaw !== 'string' || !nameRaw.trim()) {
      return { ok: false, message: 'Name is required' };
    }
    patch.name = nameRaw.trim();
  }

  const qtyRaw = pickField(body, 'quantity');
  if (qtyRaw !== undefined) {
    const quantity = parseQuantity(qtyRaw);
    if (quantity === null) return { ok: false, message: 'Invalid quantity' };
    patch.quantity = quantity;
  }

  const unitRaw = pickField(body, 'unit');
  if (unitRaw !== undefined) {
    patch.unit =
      typeof unitRaw === 'string' && unitRaw.trim() ? unitRaw.trim() : 'pcs';
  }

  const checkedRaw = pickField(body, 'checked');
  if (checkedRaw !== undefined) patch.checked = parseChecked(checkedRaw);

  const ingredientRaw = pickField(body, 'ingredient_id');
  if (ingredientRaw !== undefined) {
    patch.ingredient_id =
      typeof ingredientRaw === 'string' && ingredientRaw.trim()
        ? ingredientRaw.trim()
        : undefined;
  }

  return { ok: true, value: patch };
}

export function expectedVersionFromBody(body: ShoppingWriteBody): number | undefined {
  const raw = pickField(body, 'version');
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0) return raw;
  return undefined;
}

const syncItemSchema = z
  .object({
    id: z.string(),
    quantity: looseQuantity,
    unit: z.string().nullish(),
  })
  .passthrough();

export const syncToPantryBodySchema = z
  .object({
    items: z.array(syncItemSchema),
  })
  .passthrough();

export const unsyncBodySchema = z
  .object({
    item_ids: z.array(z.string()),
  })
  .passthrough();

export function normalizeSyncItems(
  body: z.infer<typeof syncToPantryBodySchema>,
  assertBatchSize: (count: number) => string | null,
):
  | { ok: true; value: SyncToPantryItemInput[] }
  | { ok: false; message: string } {
  const sizeError = assertBatchSize(body.items.length);
  if (sizeError) return { ok: false, message: sizeError };
  const items: SyncToPantryItemInput[] = [];
  for (const rec of body.items) {
    if (!rec.id.trim()) return { ok: false, message: 'Each item requires id' };
    const entry: SyncToPantryItemInput = { id: rec.id.trim() };
    if (rec.quantity !== undefined && rec.quantity !== null) {
      const quantity = parseQuantity(rec.quantity);
      if (quantity === null) return { ok: false, message: 'Invalid quantity' };
      entry.quantity = quantity;
    }
    if (rec.unit !== undefined && rec.unit !== null) {
      entry.unit =
        typeof rec.unit === 'string' && rec.unit.trim() ? rec.unit.trim() : 'pcs';
    }
    items.push(entry);
  }
  return { ok: true, value: items };
}

export function normalizeUnsyncIds(
  body: z.infer<typeof unsyncBodySchema>,
  assertBatchSize: (count: number) => string | null,
): { ok: true; value: string[] } | { ok: false; message: string } {
  const sizeError = assertBatchSize(body.item_ids.length);
  if (sizeError) return { ok: false, message: sizeError };
  const ids: string[] = [];
  for (const raw of body.item_ids) {
    if (!raw.trim()) {
      return { ok: false, message: 'Each item_id must be a non-empty string' };
    }
    ids.push(raw.trim());
  }
  return { ok: true, value: ids };
}
