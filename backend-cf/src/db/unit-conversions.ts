import { nowUnixSeconds } from '../lib/time';
import { normalizeUnitKey } from './meal-plan';

export type UnitConversionRow = {
  id: string;
  user_id: string;
  item_name: string;
  base_unit: string;
  target_unit: string;
  ratio: number;
  created_at: number | null;
  updated_at: number | null;
};

export type UnitConversionDto = {
  id: string;
  itemName: string;
  baseUnit: string;
  targetUnit: string;
  ratio: number;
};

function normalizeItemName(name: string): string {
  return name.trim().toLowerCase();
}

export function toUnitConversionDto(row: UnitConversionRow): UnitConversionDto {
  return {
    id: row.id,
    itemName: row.item_name,
    baseUnit: row.base_unit,
    targetUnit: row.target_unit,
    ratio: row.ratio,
  };
}

/** Convert qty from fromUnit → toUnit using a stored ratio (1 base = ratio target). */
export function convertQuantity(
  qty: number,
  fromUnit: string,
  toUnit: string,
  conv: Pick<UnitConversionRow, 'base_unit' | 'target_unit' | 'ratio'>,
): number | null {
  if (!(qty >= 0) || !(conv.ratio > 0)) return null;
  const from = normalizeUnitKey(fromUnit);
  const to = normalizeUnitKey(toUnit);
  if (from === to) return qty;
  const base = normalizeUnitKey(conv.base_unit);
  const target = normalizeUnitKey(conv.target_unit);
  if (from === base && to === target) return qty * conv.ratio;
  if (from === target && to === base) return qty / conv.ratio;
  return null;
}

export async function listConversionsForUser(
  db: D1Database,
  userId: string,
): Promise<UnitConversionRow[]> {
  const res = await db
    .prepare(
      `SELECT * FROM unit_conversion_table
       WHERE user_id = ?
       ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<UnitConversionRow>();
  return res.results ?? [];
}

/** Find a conversion covering item + either unit direction. */
export function findConversion(
  rows: UnitConversionRow[],
  itemName: string,
  unitA: string,
  unitB: string,
): UnitConversionRow | null {
  const item = normalizeItemName(itemName);
  const a = normalizeUnitKey(unitA);
  const b = normalizeUnitKey(unitB);
  if (!item || a === b) return null;
  for (const row of rows) {
    if (normalizeItemName(row.item_name) !== item) continue;
    const base = normalizeUnitKey(row.base_unit);
    const target = normalizeUnitKey(row.target_unit);
    if ((base === a && target === b) || (base === b && target === a)) {
      return row;
    }
  }
  return null;
}

export async function upsertConversion(
  db: D1Database,
  userId: string,
  input: {
    itemName: string;
    baseUnit: string;
    targetUnit: string;
    ratio: number;
  },
): Promise<UnitConversionRow> {
  const itemName = input.itemName.trim();
  const baseUnit = input.baseUnit.trim() || 'pcs';
  const targetUnit = input.targetUnit.trim() || 'pcs';
  if (!itemName) throw new Error('itemName is required');
  if (!(input.ratio > 0) || !Number.isFinite(input.ratio)) {
    throw new Error('ratio must be a positive number');
  }
  if (normalizeUnitKey(baseUnit) === normalizeUnitKey(targetUnit)) {
    throw new Error('baseUnit and targetUnit must differ');
  }

  const now = nowUnixSeconds();
  const existing = await db
    .prepare(
      `SELECT * FROM unit_conversion_table
       WHERE user_id = ? AND lower(item_name) = lower(?)
         AND lower(base_unit) = lower(?) AND lower(target_unit) = lower(?)
       LIMIT 1`,
    )
    .bind(userId, itemName, baseUnit, targetUnit)
    .first<UnitConversionRow>();

  if (existing) {
    await db
      .prepare(
        `UPDATE unit_conversion_table
         SET ratio = ?, item_name = ?, base_unit = ?, target_unit = ?,
             updated_at = ?
         WHERE id = ? AND user_id = ?`,
      )
      .bind(
        input.ratio,
        itemName,
        baseUnit,
        targetUnit,
        now,
        existing.id,
        userId,
      )
      .run();
    const row = await db
      .prepare(`SELECT * FROM unit_conversion_table WHERE id = ? LIMIT 1`)
      .bind(existing.id)
      .first<UnitConversionRow>();
    if (!row) throw new Error('Failed to load updated conversion');
    return row;
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO unit_conversion_table
        (id, user_id, item_name, base_unit, target_unit, ratio, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, userId, itemName, baseUnit, targetUnit, input.ratio, now, now)
    .run();

  const row = await db
    .prepare(`SELECT * FROM unit_conversion_table WHERE id = ? LIMIT 1`)
    .bind(id)
    .first<UnitConversionRow>();
  if (!row) throw new Error('Failed to create conversion');
  return row;
}
