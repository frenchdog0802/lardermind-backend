import { nowUnixSeconds } from '../lib/time';

export type IngredientRow = {
  id: string;
  user_id: string;
  name: string;
  default_unit: string;
  unit_kind: string | null;
  base_unit: string | null;
  default_display_unit: string | null;
  kind_locked: number;
  image_url: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type IngredientDto = {
  id: string;
  name: string;
  default_unit: string;
  unit_kind?: 'weight' | 'volume' | 'count';
  base_unit?: string;
  default_display_unit?: string;
  kind_locked?: boolean;
  image_url?: string;
};

export type IngredientInput = {
  name: string;
  default_unit?: string;
  unit_kind?: string;
  base_unit?: string;
  default_display_unit?: string;
  kind_locked?: boolean;
  image_url?: string;
};

export type IngredientPatch = Partial<IngredientInput>;

function parseUnitKind(
  raw: string | null,
): 'weight' | 'volume' | 'count' | undefined {
  if (raw === 'weight' || raw === 'volume' || raw === 'count') return raw;
  return undefined;
}

export function toIngredientDto(row: IngredientRow): IngredientDto {
  const dto: IngredientDto = {
    id: row.id,
    name: row.name,
    default_unit: row.default_unit ?? 'pcs',
  };
  const unitKind = parseUnitKind(row.unit_kind);
  if (unitKind) dto.unit_kind = unitKind;
  if (row.base_unit) dto.base_unit = row.base_unit;
  if (row.default_display_unit) {
    dto.default_display_unit = row.default_display_unit;
  }
  if (row.kind_locked === 1) dto.kind_locked = true;
  if (row.image_url) dto.image_url = row.image_url;
  return dto;
}

export async function listIngredients(
  db: D1Database,
  userId: string,
  query?: string,
): Promise<IngredientRow[]> {
  const sql = query?.trim()
    ? `SELECT * FROM ingredients
       WHERE user_id = ? AND LOWER(name) LIKE LOWER(?)
       ORDER BY created_at ASC`
    : `SELECT * FROM ingredients WHERE user_id = ? ORDER BY created_at ASC`;
  const stmt = db.prepare(sql);
  const result = query?.trim()
    ? await stmt.bind(userId, `%${query.trim()}%`).all<IngredientRow>()
    : await stmt.bind(userId).all<IngredientRow>();
  return result.results ?? [];
}

export async function getIngredient(
  db: D1Database,
  userId: string,
  id: string,
): Promise<IngredientRow | null> {
  return db
    .prepare(`SELECT * FROM ingredients WHERE id = ? AND user_id = ? LIMIT 1`)
    .bind(id, userId)
    .first<IngredientRow>();
}

export async function createIngredient(
  db: D1Database,
  userId: string,
  input: IngredientInput,
): Promise<IngredientRow> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT INTO ingredients
        (id, user_id, name, default_unit, unit_kind, base_unit,
         default_display_unit, kind_locked, image_url, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      userId,
      input.name,
      input.default_unit ?? 'pcs',
      input.unit_kind ?? null,
      input.base_unit ?? null,
      input.default_display_unit ?? null,
      input.kind_locked ? 1 : 0,
      input.image_url ?? null,
      now,
      now,
    )
    .run();

  const row = await getIngredient(db, userId, id);
  if (!row) throw new Error('Failed to load created ingredient');
  return row;
}

export async function updateIngredient(
  db: D1Database,
  userId: string,
  id: string,
  patch: IngredientPatch,
): Promise<IngredientRow | null> {
  const existing = await getIngredient(db, userId, id);
  if (!existing) return null;

  const name = patch.name ?? existing.name;
  const defaultUnit = patch.default_unit ?? existing.default_unit ?? 'pcs';
  const unitKind =
    patch.unit_kind !== undefined ? patch.unit_kind : existing.unit_kind;
  const baseUnit =
    patch.base_unit !== undefined ? patch.base_unit : existing.base_unit;
  const defaultDisplayUnit =
    patch.default_display_unit !== undefined
      ? patch.default_display_unit
      : existing.default_display_unit;
  const kindLocked =
    patch.kind_locked !== undefined
      ? patch.kind_locked
        ? 1
        : 0
      : existing.kind_locked;
  const imageUrl =
    patch.image_url !== undefined ? patch.image_url : existing.image_url;
  const now = nowUnixSeconds();

  await db
    .prepare(
      `UPDATE ingredients
       SET name = ?, default_unit = ?, unit_kind = ?, base_unit = ?,
           default_display_unit = ?, kind_locked = ?, image_url = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(
      name,
      defaultUnit,
      unitKind,
      baseUnit,
      defaultDisplayUnit,
      kindLocked,
      imageUrl,
      now,
      id,
      userId,
    )
    .run();

  return getIngredient(db, userId, id);
}

export async function deleteIngredient(
  db: D1Database,
  userId: string,
  id: string,
): Promise<boolean> {
  const result = await db
    .prepare(`DELETE FROM ingredients WHERE id = ? AND user_id = ?`)
    .bind(id, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}
