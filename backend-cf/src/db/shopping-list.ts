import { nowUnixSeconds } from '../lib/time';
import {
  findByIngredientId,
  findByNameCi,
  mergeAddPantryItem,
  updatePantryItem,
} from './pantry';

export type ShoppingListItemRow = {
  id: string;
  user_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  checked: number;
  ingredient_id: string | null;
  has_been_added_to_pantry: number;
  created_at: number | null;
  updated_at: number | null;
  version?: number | null;
};

export type ShoppingListItemDto = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  synced_to_pantry: boolean;
  version: number;
  ingredient_id?: string;
  details: {
    quantity: number;
    unit: string;
    checked: boolean;
    synced_to_pantry: boolean;
    version: number;
    ingredient_id?: string;
  };
};

export type ShoppingListItemInput = {
  name: string;
  quantity: number;
  unit: string;
  checked?: boolean;
  ingredient_id?: string;
};

export type ShoppingListItemPatch = Partial<ShoppingListItemInput>;

export type SyncToPantryItemInput = {
  id: string;
  quantity?: number;
  unit?: string;
};

export type SyncSkipReason =
  | 'not_found'
  | 'already_synced'
  | 'not_synced'
  | 'not_checked'
  | 'invalid_quantity';

export type SyncSkip = { id: string; reason: SyncSkipReason };

export type SyncToPantryResult = {
  synced: ShoppingListItemDto[];
  skipped: SyncSkip[];
};

export type UnsyncFromPantryResult = {
  unsynced: ShoppingListItemDto[];
  skipped: SyncSkip[];
};

const MAX_BATCH = 100;

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function flagFromRow(row: ShoppingListItemRow): boolean {
  return row.has_been_added_to_pantry === 1;
}

export function toShoppingListItemDto(
  row: ShoppingListItemRow,
): ShoppingListItemDto {
  const quantity = quantityFromRow(row.quantity);
  const unit = row.unit ?? 'pcs';
  const checked = row.checked === 1;
  const synced_to_pantry = flagFromRow(row);
  const version = row.version ?? 1;
  const details: ShoppingListItemDto['details'] = {
    quantity,
    unit,
    checked,
    synced_to_pantry,
    version,
  };
  if (row.ingredient_id) details.ingredient_id = row.ingredient_id;

  const dto: ShoppingListItemDto = {
    id: row.id,
    name: row.name,
    quantity,
    unit,
    checked,
    synced_to_pantry,
    version,
    details,
  };
  if (row.ingredient_id) dto.ingredient_id = row.ingredient_id;
  return dto;
}

async function findPantryForShoppingItem(
  db: D1Database,
  userId: string,
  name: string,
  ingredientId: string | null,
) {
  if (ingredientId) {
    const byIngredient = await findByIngredientId(db, userId, ingredientId);
    if (byIngredient) return byIngredient;
  }
  return findByNameCi(db, userId, name);
}

async function syncPantryOnCheck(
  db: D1Database,
  userId: string,
  name: string,
  quantity: number,
  unit: string,
  ingredientId: string | null | undefined,
): Promise<void> {
  const input = {
    name,
    quantity,
    unit,
    ...(ingredientId ? { ingredient_id: ingredientId } : {}),
  };
  await mergeAddPantryItem(db, userId, input);
}

async function syncPantryOnUncheck(
  db: D1Database,
  userId: string,
  name: string,
  quantity: number,
  ingredientId: string | null,
): Promise<void> {
  const pantry = await findPantryForShoppingItem(
    db,
    userId,
    name,
    ingredientId,
  );
  if (!pantry) return;

  const available = quantityFromRow(pantry.quantity);
  const newQty = Math.max(0, available - quantity);
  await updatePantryItem(db, userId, pantry.id, { quantity: newQty });
}

async function setSyncedFlag(
  db: D1Database,
  userId: string,
  id: string,
  flag: 0 | 1,
): Promise<ShoppingListItemRow | null> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `UPDATE shopping_list_items
       SET has_been_added_to_pantry = ?, updated_at = ?, version = COALESCE(version, 1) + 1
       WHERE id = ? AND user_id = ?`,
    )
    .bind(flag, now, id, userId)
    .run();
  return getShoppingListItem(db, userId, id);
}

export async function listShoppingListItems(
  db: D1Database,
  userId: string,
  query?: string,
): Promise<ShoppingListItemRow[]> {
  const sql = query?.trim()
    ? `SELECT * FROM shopping_list_items
       WHERE user_id = ? AND LOWER(name) LIKE LOWER(?)
       ORDER BY created_at ASC`
    : `SELECT * FROM shopping_list_items
       WHERE user_id = ? ORDER BY created_at ASC`;
  const stmt = db.prepare(sql);
  const result = query?.trim()
    ? await stmt.bind(userId, `%${query.trim()}%`).all<ShoppingListItemRow>()
    : await stmt.bind(userId).all<ShoppingListItemRow>();
  return result.results ?? [];
}

export async function getShoppingListItem(
  db: D1Database,
  userId: string,
  id: string,
): Promise<ShoppingListItemRow | null> {
  return db
    .prepare(
      `SELECT * FROM shopping_list_items WHERE id = ? AND user_id = ? LIMIT 1`,
    )
    .bind(id, userId)
    .first<ShoppingListItemRow>();
}

export async function createShoppingListItem(
  db: D1Database,
  userId: string,
  input: ShoppingListItemInput,
): Promise<ShoppingListItemRow> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  const checked = input.checked ? 1 : 0;
  // Check no longer auto-writes pantry; flag stays 0 until batch sync.
  const hasBeenAdded = 0;
  const unit = input.unit?.trim() || 'pcs';

  await db
    .prepare(
      `INSERT INTO shopping_list_items
        (id, user_id, name, quantity, unit, checked, ingredient_id, has_been_added_to_pantry, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      String(input.quantity),
      unit,
      checked,
      input.ingredient_id ?? null,
      hasBeenAdded,
      now,
      now,
    )
    .run();

  const row = await getShoppingListItem(db, userId, id);
  if (!row) throw new Error('Failed to load created shopping list item');
  return row;
}

function normalizeShoppingUnit(unit: string | null | undefined): string {
  const t = unit?.trim();
  return t ? t : 'pcs';
}

/** Unchecked row with same CI name + unit (merge target for add). */
export async function findUncheckedByNameUnitCi(
  db: D1Database,
  userId: string,
  name: string,
  unit: string,
): Promise<ShoppingListItemRow | null> {
  const rows = await listShoppingListItems(db, userId);
  const nameKey = name.trim().toLowerCase();
  const unitKey = normalizeShoppingUnit(unit).toLowerCase();
  return (
    rows.find(
      (r) =>
        r.checked === 0 &&
        r.name.trim().toLowerCase() === nameKey &&
        normalizeShoppingUnit(r.unit).toLowerCase() === unitKey,
    ) ?? null
  );
}

/**
 * Upsert by case-insensitive name + unit onto an unchecked row.
 * Checked-only matches create a new unchecked row (do not revive checked lines).
 */
export async function mergeAddShoppingListItem(
  db: D1Database,
  userId: string,
  input: ShoppingListItemInput,
): Promise<{ item: ShoppingListItemRow; merged: boolean }> {
  const unit = normalizeShoppingUnit(input.unit);
  const existing = await findUncheckedByNameUnitCi(
    db,
    userId,
    input.name,
    unit,
  );
  if (!existing) {
    const item = await createShoppingListItem(db, userId, { ...input, unit });
    return { item, merged: false };
  }

  const existingQty = quantityFromRow(existing.quantity);
  const updated = await updateShoppingListItem(db, userId, existing.id, {
    quantity: existingQty + input.quantity,
    unit,
  });
  if (!updated) {
    throw new Error('Failed to merge shopping list item');
  }
  return { item: updated, merged: true };
}

export class VersionConflictError extends Error {
  current: ShoppingListItemRow;

  constructor(current: ShoppingListItemRow) {
    super('Version conflict');
    this.name = 'VersionConflictError';
    this.current = current;
  }
}

export type DeleteShoppingResult =
  | { status: 'deleted' }
  | { status: 'not_found' }
  | { status: 'conflict'; item: ShoppingListItemRow };

export async function updateShoppingListItem(
  db: D1Database,
  userId: string,
  id: string,
  patch: ShoppingListItemPatch,
  expectedVersion?: number,
): Promise<ShoppingListItemRow | null> {
  const existing = await getShoppingListItem(db, userId, id);
  if (!existing) return null;
  const currentVersion = existing.version ?? 1;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    throw new VersionConflictError(existing);
  }

  const name = patch.name ?? existing.name;
  const quantity =
    patch.quantity !== undefined
      ? patch.quantity
      : quantityFromRow(existing.quantity);
  const unit = patch.unit ?? existing.unit ?? 'pcs';
  const checked =
    patch.checked !== undefined ? (patch.checked ? 1 : 0) : existing.checked;
  const ingredientId =
    patch.ingredient_id !== undefined
      ? (patch.ingredient_id ?? null)
      : existing.ingredient_id;

  // Preserve sync flag; check/uncheck no longer mutates pantry.
  const hasBeenAdded = flagFromRow(existing) ? 1 : 0;

  const now = nowUnixSeconds();

  const result = await db
    .prepare(
      `UPDATE shopping_list_items
       SET name = ?, quantity = ?, unit = ?, checked = ?, ingredient_id = ?, has_been_added_to_pantry = ?, updated_at = ?, version = COALESCE(version, 1) + 1
       WHERE id = ? AND user_id = ? AND COALESCE(version, 1) = ?`,
    )
    .bind(
      name,
      String(quantity),
      unit,
      checked,
      ingredientId,
      hasBeenAdded,
      now,
      id,
      userId,
      currentVersion,
    )
    .run();

  if ((result.meta?.changes ?? 0) === 0) {
    const current = await getShoppingListItem(db, userId, id);
    if (!current) return null;
    throw new VersionConflictError(current);
  }
  return getShoppingListItem(db, userId, id);
}

export async function deleteShoppingListItem(
  db: D1Database,
  userId: string,
  id: string,
  expectedVersion?: number,
): Promise<DeleteShoppingResult> {
  const existing = await getShoppingListItem(db, userId, id);
  if (!existing) return { status: 'not_found' };
  const currentVersion = existing.version ?? 1;
  if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
    return { status: 'conflict', item: existing };
  }
  const result =
    expectedVersion === undefined
      ? await db
          .prepare(
            `DELETE FROM shopping_list_items WHERE id = ? AND user_id = ?`,
          )
          .bind(id, userId)
          .run()
      : await db
          .prepare(
            `DELETE FROM shopping_list_items
             WHERE id = ? AND user_id = ? AND COALESCE(version, 1) = ?`,
          )
          .bind(id, userId, expectedVersion)
          .run();
  if ((result.meta?.changes ?? 0) > 0) return { status: 'deleted' };
  const current = await getShoppingListItem(db, userId, id);
  if (!current) return { status: 'not_found' };
  return { status: 'conflict', item: current };
}

export function assertBatchSize(count: number): string | null {
  if (count <= 0) return 'items is required';
  if (count > MAX_BATCH) return `At most ${MAX_BATCH} items allowed`;
  return null;
}

export async function syncItemsToPantry(
  db: D1Database,
  userId: string,
  items: SyncToPantryItemInput[],
): Promise<SyncToPantryResult> {
  const synced: ShoppingListItemDto[] = [];
  const skipped: SyncSkip[] = [];

  for (const item of items) {
    const row = await getShoppingListItem(db, userId, item.id);
    if (!row) {
      skipped.push({ id: item.id, reason: 'not_found' });
      continue;
    }
    if (flagFromRow(row)) {
      skipped.push({ id: item.id, reason: 'already_synced' });
      continue;
    }
    if (row.checked !== 1) {
      skipped.push({ id: item.id, reason: 'not_checked' });
      continue;
    }

    const quantity =
      item.quantity !== undefined
        ? item.quantity
        : quantityFromRow(row.quantity);
    if (!Number.isFinite(quantity)) {
      skipped.push({ id: item.id, reason: 'invalid_quantity' });
      continue;
    }
    const unit =
      item.unit !== undefined && item.unit.trim()
        ? item.unit.trim()
        : (row.unit ?? 'pcs');

    await syncPantryOnCheck(
      db,
      userId,
      row.name,
      quantity,
      unit,
      row.ingredient_id,
    );

    // Persist optional qty/unit overrides on the shopping row so unsync matches.
    if (item.quantity !== undefined || item.unit !== undefined) {
      const now = nowUnixSeconds();
      await db
        .prepare(
          `UPDATE shopping_list_items
           SET quantity = ?, unit = ?, has_been_added_to_pantry = 1, updated_at = ?, version = COALESCE(version, 1) + 1
           WHERE id = ? AND user_id = ?`,
        )
        .bind(String(quantity), unit, now, item.id, userId)
        .run();
    } else {
      await setSyncedFlag(db, userId, item.id, 1);
    }

    const updated = await getShoppingListItem(db, userId, item.id);
    if (updated) synced.push(toShoppingListItemDto(updated));
  }

  return { synced, skipped };
}

export async function unsyncItemsFromPantry(
  db: D1Database,
  userId: string,
  itemIds: string[],
): Promise<UnsyncFromPantryResult> {
  const unsynced: ShoppingListItemDto[] = [];
  const skipped: SyncSkip[] = [];

  for (const id of itemIds) {
    const row = await getShoppingListItem(db, userId, id);
    if (!row) {
      skipped.push({ id, reason: 'not_found' });
      continue;
    }
    if (!flagFromRow(row)) {
      skipped.push({ id, reason: 'not_synced' });
      continue;
    }

    await syncPantryOnUncheck(
      db,
      userId,
      row.name,
      quantityFromRow(row.quantity),
      row.ingredient_id,
    );
    await setSyncedFlag(db, userId, id, 0);
    const updated = await getShoppingListItem(db, userId, id);
    if (updated) unsynced.push(toShoppingListItemDto(updated));
  }

  return { unsynced, skipped };
}
