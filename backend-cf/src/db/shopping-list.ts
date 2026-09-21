import { nowUnixSeconds } from '../lib/time';

export type ShoppingListItemRow = {
  id: string;
  user_id: string;
  name: string;
  quantity: string | null;
  unit: string | null;
  checked: number;
  ingredient_id: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type ShoppingListItemDto = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  checked: boolean;
  ingredient_id?: string;
  details: {
    quantity: number;
    unit: string;
    checked: boolean;
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

function quantityFromRow(raw: string | null): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

export function toShoppingListItemDto(
  row: ShoppingListItemRow,
): ShoppingListItemDto {
  const quantity = quantityFromRow(row.quantity);
  const unit = row.unit ?? 'pcs';
  const checked = row.checked === 1;
  const details: ShoppingListItemDto['details'] = {
    quantity,
    unit,
    checked,
  };
  if (row.ingredient_id) details.ingredient_id = row.ingredient_id;

  const dto: ShoppingListItemDto = {
    id: row.id,
    name: row.name,
    quantity,
    unit,
    checked,
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
  await db
    .prepare(
      `INSERT INTO shopping_list_items
        (id, user_id, name, quantity, unit, checked, ingredient_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      String(input.quantity),
      input.unit,
      input.checked ? 1 : 0,
      input.ingredient_id ?? null,
      now,
      now,
    )
    .run();

  const row = await getShoppingListItem(db, userId, id);
  if (!row) throw new Error('Failed to load created shopping list item');
  return row;
}

export async function updateShoppingListItem(
  db: D1Database,
  userId: string,
  id: string,
  patch: ShoppingListItemPatch,
): Promise<ShoppingListItemRow | null> {
  const existing = await getShoppingListItem(db, userId, id);
  if (!existing) return null;

  const name = patch.name ?? existing.name;
  const quantity =
    patch.quantity !== undefined
      ? String(patch.quantity)
      : (existing.quantity ?? '0');
  const unit = patch.unit ?? existing.unit ?? 'pcs';
  const checked =
    patch.checked !== undefined ? (patch.checked ? 1 : 0) : existing.checked;
  const ingredientId =
    patch.ingredient_id !== undefined
      ? (patch.ingredient_id ?? null)
      : existing.ingredient_id;
  const now = nowUnixSeconds();

  await db
    .prepare(
      `UPDATE shopping_list_items
       SET name = ?, quantity = ?, unit = ?, checked = ?, ingredient_id = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(name, quantity, unit, checked, ingredientId, now, id, userId)
    .run();

  return getShoppingListItem(db, userId, id);
}

export async function deleteShoppingListItem(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM shopping_list_items WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
