import { nowUnixSeconds } from '../lib/time';
import {
  insertPantryStatement,
  listPantryMatching,
  quantityInPantryUnit,
  updatePantryRowStatement,
  type PantryItemRow,
} from './pantry';
import { selectInChunks } from './sql-utils';
import { standardConvert } from './units';

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

/** Unchecked row with same CI name + unit (merge target for add). Targeted LIMIT 1 query. */
export async function findUncheckedByNameUnitCi(
  db: D1Database,
  userId: string,
  name: string,
  unit: string,
): Promise<ShoppingListItemRow | null> {
  return db
    .prepare(
      `SELECT * FROM shopping_list_items
       WHERE user_id = ? AND checked = 0
         AND name = ? COLLATE NOCASE
         AND COALESCE(NULLIF(TRIM(unit), ''), 'pcs') = ? COLLATE NOCASE
       ORDER BY created_at ASC LIMIT 1`,
    )
    .bind(userId, name.trim(), normalizeShoppingUnit(unit))
    .first<ShoppingListItemRow>();
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
  let existing = await findUncheckedByNameUnitCi(db, userId, input.name, unit);
  let addQty = input.quantity;
  if (!existing) {
    // Same name, different but convertible unit (e.g. 22.5 g + 1 kg): merge
    // additively in the existing row's unit. Incompatible units stay separate.
    const { results } = await db
      .prepare(
        `SELECT * FROM shopping_list_items
         WHERE user_id = ? AND checked = 0 AND name = ? COLLATE NOCASE
         ORDER BY created_at ASC`,
      )
      .bind(userId, input.name.trim())
      .all<ShoppingListItemRow>();
    for (const row of results ?? []) {
      const converted = standardConvert(
        input.quantity,
        unit,
        normalizeShoppingUnit(row.unit),
      );
      if (converted !== null) {
        existing = row;
        addQty = converted;
        break;
      }
    }
  }
  if (!existing) {
    const item = await createShoppingListItem(db, userId, { ...input, unit });
    return { item, merged: false };
  }

  const existingQty = quantityFromRow(existing.quantity);
  const updated = await updateShoppingListItem(db, userId, existing.id, {
    quantity: Math.round((existingQty + addQty) * 10000) / 10000,
    unit: normalizeShoppingUnit(existing.unit),
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

/** Prefetch the user's shopping rows for `ids` with chunked IN queries (superset-safe). */
async function loadShoppingRows(
  db: D1Database,
  userId: string,
  ids: string[],
): Promise<Map<string, ShoppingListItemRow>> {
  const wanted = new Set(ids);
  const rows = await selectInChunks<ShoppingListItemRow>(
    db,
    ids,
    (ph) => `SELECT * FROM shopping_list_items WHERE user_id = ? AND id IN (${ph})`,
    [userId],
  );
  const map = new Map<string, ShoppingListItemRow>();
  for (const row of rows) {
    if (wanted.has(row.id) && row.user_id === userId) map.set(row.id, { ...row });
  }
  return map;
}

/** In-memory pantry used while a batch is planned; mirrors the rows the batch will write. */
class PantryWorkingSet {
  private rows: PantryItemRow[];

  constructor(rows: PantryItemRow[]) {
    this.rows = rows.map((r) => ({ ...r }));
  }

  findByNameCi(name: string): PantryItemRow | null {
    const lower = name.toLowerCase();
    return this.rows.find((r) => r.name.toLowerCase() === lower) ?? null;
  }

  findByIngredientId(ingredientId: string): PantryItemRow | null {
    return this.rows.find((r) => r.ingredient_id === ingredientId) ?? null;
  }

  add(row: PantryItemRow): void {
    this.rows.push(row);
  }

  remove(row: PantryItemRow): void {
    const i = this.rows.indexOf(row);
    if (i >= 0) this.rows.splice(i, 1);
  }
}

/** Same merge-add semantics as mergeAddPantryItem, planned in memory. */
function planPantryMergeAdd(
  db: D1Database,
  userId: string,
  pantry: PantryWorkingSet,
  input: { name: string; quantity: number; unit: string; ingredient_id?: string },
  now: number,
  writes: D1PreparedStatement[],
): void {
  const existing = pantry.findByNameCi(input.name);
  if (!existing) {
    const row: PantryItemRow = {
      id: crypto.randomUUID(),
      user_id: userId,
      name: input.name,
      quantity: String(input.quantity),
      unit: input.unit,
      notes: null,
      ingredient_id: input.ingredient_id ?? null,
      created_at: now,
      updated_at: now,
    };
    writes.push(insertPantryStatement(db, row));
    pantry.add(row);
    return;
  }
  const existingQty = quantityFromRow(existing.quantity);
  const hasUnit = Boolean(existing.unit?.trim());
  const unit = hasUnit ? existing.unit : input.unit || 'pcs';
  const addQty = hasUnit
    ? quantityInPantryUnit(input.quantity, input.unit, existing.unit)
    : input.quantity;
  existing.quantity = String(existingQty + addQty);
  existing.unit = unit;
  existing.updated_at = now;
  writes.push(updatePantryRowStatement(db, existing));
}

/**
 * Undo of the check-off sync. If the check-off created the pantry row (or merged the full
 * remaining quantity), the quantity reaches zero and the row is deleted — never leave a
 * "0 pcs" ghost. If it merged into an existing row, the previous quantity is restored.
 */
function planPantryUndo(
  db: D1Database,
  userId: string,
  pantry: PantryWorkingSet,
  name: string,
  quantity: number,
  unit: string,
  ingredientId: string | null,
  now: number,
  writes: D1PreparedStatement[],
): void {
  const row =
    (ingredientId ? pantry.findByIngredientId(ingredientId) : null) ??
    pantry.findByNameCi(name);
  if (!row) return;
  const available = quantityFromRow(row.quantity);
  const remove = quantityInPantryUnit(quantity, unit, row.unit);
  const newQty = available - remove;
  if (newQty <= 1e-9) {
    writes.push(
      db.prepare(`DELETE FROM pantry_items WHERE id = ? AND user_id = ?`).bind(row.id, userId),
    );
    pantry.remove(row);
    return;
  }
  row.quantity = String(newQty);
  row.updated_at = now;
  writes.push(updatePantryRowStatement(db, row));
}

function setSyncedFlagStatement(
  db: D1Database,
  userId: string,
  id: string,
  flag: 0 | 1,
  now: number,
): D1PreparedStatement {
  return db
    .prepare(
      `UPDATE shopping_list_items
       SET has_been_added_to_pantry = ?, updated_at = ?, version = COALESCE(version, 1) + 1
       WHERE id = ? AND user_id = ?`,
    )
    .bind(flag, now, id, userId);
}

/**
 * Batch check-off sync: prefetch shopping + pantry rows with IN queries, decide everything in
 * memory (items are processed in order, so later items see earlier items' pantry changes),
 * then commit all writes in a single db.batch.
 */
export async function syncItemsToPantry(
  db: D1Database,
  userId: string,
  items: SyncToPantryItemInput[],
): Promise<SyncToPantryResult> {
  const synced: ShoppingListItemDto[] = [];
  const skipped: SyncSkip[] = [];
  const rows = await loadShoppingRows(
    db,
    userId,
    items.map((i) => i.id),
  );
  const pantry = new PantryWorkingSet(
    await listPantryMatching(db, userId, {
      names: [...rows.values()].map((r) => r.name),
      ingredientIds: [],
    }),
  );
  const writes: D1PreparedStatement[] = [];
  const now = nowUnixSeconds();

  for (const item of items) {
    const row = rows.get(item.id);
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

    planPantryMergeAdd(
      db,
      userId,
      pantry,
      {
        name: row.name,
        quantity,
        unit,
        ...(row.ingredient_id ? { ingredient_id: row.ingredient_id } : {}),
      },
      now,
      writes,
    );

    // Persist optional qty/unit overrides on the shopping row so unsync matches.
    if (item.quantity !== undefined || item.unit !== undefined) {
      writes.push(
        db
          .prepare(
            `UPDATE shopping_list_items
             SET quantity = ?, unit = ?, has_been_added_to_pantry = 1, updated_at = ?, version = COALESCE(version, 1) + 1
             WHERE id = ? AND user_id = ?`,
          )
          .bind(String(quantity), unit, now, item.id, userId),
      );
      row.quantity = String(quantity);
      row.unit = unit;
    } else {
      writes.push(setSyncedFlagStatement(db, userId, item.id, 1, now));
    }
    row.has_been_added_to_pantry = 1;
    row.updated_at = now;
    row.version = (row.version ?? 1) + 1;
    synced.push(toShoppingListItemDto(row));
  }

  if (writes.length > 0) await db.batch(writes);
  return { synced, skipped };
}

export async function unsyncItemsFromPantry(
  db: D1Database,
  userId: string,
  itemIds: string[],
): Promise<UnsyncFromPantryResult> {
  const unsynced: ShoppingListItemDto[] = [];
  const skipped: SyncSkip[] = [];
  const rows = await loadShoppingRows(db, userId, itemIds);
  const syncedRows = [...rows.values()].filter(flagFromRow);
  const pantry = new PantryWorkingSet(
    await listPantryMatching(db, userId, {
      names: syncedRows.map((r) => r.name),
      ingredientIds: syncedRows.flatMap((r) => (r.ingredient_id ? [r.ingredient_id] : [])),
    }),
  );
  const writes: D1PreparedStatement[] = [];
  const now = nowUnixSeconds();

  for (const id of itemIds) {
    const row = rows.get(id);
    if (!row) {
      skipped.push({ id, reason: 'not_found' });
      continue;
    }
    if (!flagFromRow(row)) {
      skipped.push({ id, reason: 'not_synced' });
      continue;
    }

    planPantryUndo(
      db,
      userId,
      pantry,
      row.name,
      quantityFromRow(row.quantity),
      row.unit ?? 'pcs',
      row.ingredient_id,
      now,
      writes,
    );
    writes.push(setSyncedFlagStatement(db, userId, id, 0, now));
    row.has_been_added_to_pantry = 0;
    row.updated_at = now;
    row.version = (row.version ?? 1) + 1;
    unsynced.push(toShoppingListItemDto(row));
  }

  if (writes.length > 0) await db.batch(writes);
  return { unsynced, skipped };
}
