import { nowUnixSeconds } from '../lib/time';

export type PantryItemRow = {
  id: string;
  user_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  notes: string | null;
  ingredient_id: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type PantryItemDto = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  ingredient_id?: string;
  notes?: string;
  details: {
    quantity: number;
    unit: string;
    ingredient_id?: string;
    notes?: string;
  };
};

export type PantryItemInput = {
  name: string;
  quantity: number;
  unit: string;
  notes?: string;
  ingredient_id?: string;
};

export type PantryItemPatch = Partial<PantryItemInput>;

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function toPantryItemDto(row: PantryItemRow): PantryItemDto {
  const quantity = quantityFromRow(row.quantity);
  const unit = row.unit ?? 'pcs';
  const details: PantryItemDto['details'] = { quantity, unit };
  if (row.ingredient_id) details.ingredient_id = row.ingredient_id;
  if (row.notes) details.notes = row.notes;

  const dto: PantryItemDto = {
    id: row.id,
    name: row.name,
    quantity,
    unit,
    details,
  };
  if (row.ingredient_id) dto.ingredient_id = row.ingredient_id;
  if (row.notes) dto.notes = row.notes;
  return dto;
}

export async function listPantryItems(
  db: D1Database,
  userId: string,
): Promise<PantryItemRow[]> {
  const result = await db
    .prepare(
      `SELECT * FROM pantry_items WHERE user_id = ? ORDER BY created_at ASC`,
    )
    .bind(userId)
    .all<PantryItemRow>();
  return result.results ?? [];
}

export async function getPantryItem(
  db: D1Database,
  userId: string,
  id: string,
): Promise<PantryItemRow | null> {
  return db
    .prepare(`SELECT * FROM pantry_items WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId)
    .first<PantryItemRow>();
}

export async function findByIngredientId(
  db: D1Database,
  userId: string,
  ingredientId: string,
): Promise<PantryItemRow | null> {
  return db
    .prepare(
      `SELECT * FROM pantry_items WHERE user_id = ? AND ingredient_id = ? LIMIT 1`,
    )
    .bind(userId, ingredientId)
    .first<PantryItemRow>();
}

export async function findByNameCi(
  db: D1Database,
  userId: string,
  name: string,
): Promise<PantryItemRow | null> {
  return db
    .prepare(
      `SELECT * FROM pantry_items WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
    )
    .bind(userId, name)
    .first<PantryItemRow>();
}

export async function createPantryItem(
  db: D1Database,
  userId: string,
  input: PantryItemInput,
): Promise<PantryItemRow> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT INTO pantry_items
        (id, user_id, name, quantity, unit, notes, ingredient_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      String(input.quantity),
      input.unit,
      input.notes ?? null,
      input.ingredient_id ?? null,
      now,
      now,
    )
    .run();

  const row = await getPantryItem(db, userId, id);
  if (!row) {
    throw new Error('Failed to load created pantry item');
  }
  return row;
}

export async function updatePantryItem(
  db: D1Database,
  userId: string,
  id: string,
  patch: PantryItemPatch,
): Promise<PantryItemRow | null> {
  const existing = await getPantryItem(db, userId, id);
  if (!existing) return null;

  const name = patch.name ?? existing.name;
  const quantity =
    patch.quantity !== undefined
      ? String(patch.quantity)
      : (existing.quantity ?? '0');
  const unit = patch.unit ?? existing.unit ?? 'pcs';
  const notes =
    patch.notes !== undefined ? (patch.notes ?? null) : existing.notes;
  const ingredientId =
    patch.ingredient_id !== undefined
      ? (patch.ingredient_id ?? null)
      : existing.ingredient_id;
  const now = nowUnixSeconds();

  await db
    .prepare(
      `UPDATE pantry_items
       SET name = ?, quantity = ?, unit = ?, notes = ?, ingredient_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(name, quantity, unit, notes, ingredientId, now, id, userId)
    .run();

  return getPantryItem(db, userId, id);
}

export async function deletePantryItem(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM pantry_items WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

/** Upsert by case-insensitive name: add quantity onto existing row when found. */
export async function mergeAddPantryItem(
  db: D1Database,
  userId: string,
  input: PantryItemInput,
): Promise<{ item: PantryItemRow; merged: boolean }> {
  const existing = await findByNameCi(db, userId, input.name);
  if (!existing) {
    const item = await createPantryItem(db, userId, input);
    return { item, merged: false };
  }

  const existingQty = quantityFromRow(existing.quantity);
  const unit = existing.unit?.trim() ? existing.unit : input.unit || 'pcs';
  const updated = await updatePantryItem(db, userId, existing.id, {
    quantity: existingQty + input.quantity,
    unit,
  });
  if (!updated) {
    throw new Error('Failed to merge pantry item');
  }
  return { item: updated, merged: true };
}
