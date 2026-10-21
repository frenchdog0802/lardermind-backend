import { describe, expect, it } from 'vitest';
import {
  convertQuantity,
  findConversion,
  type UnitConversionRow,
} from './unit-conversions';

function row(
  partial: Partial<UnitConversionRow> &
    Pick<UnitConversionRow, 'item_name' | 'base_unit' | 'target_unit' | 'ratio'>,
): UnitConversionRow {
  return {
    id: partial.id ?? 'c1',
    user_id: partial.user_id ?? 'u1',
    item_name: partial.item_name,
    base_unit: partial.base_unit,
    target_unit: partial.target_unit,
    ratio: partial.ratio,
    created_at: 1,
    updated_at: 1,
  };
}

describe('convertQuantity', () => {
  const packToG = row({
    item_name: '排骨',
    base_unit: '包',
    target_unit: 'g',
    ratio: 500,
  });

  it('converts base → target and inverse', () => {
    expect(convertQuantity(2, '包', 'g', packToG)).toBe(1000);
    expect(convertQuantity(500, 'g', '包', packToG)).toBe(1);
  });

  it('returns null when units do not match the conversion pair', () => {
    expect(convertQuantity(1, '包', 'ml', packToG)).toBeNull();
  });

  it('rejects non-positive ratio or qty', () => {
    expect(
      convertQuantity(1, '包', 'g', { ...packToG, ratio: 0 }),
    ).toBeNull();
  });
});

describe('findConversion', () => {
  const rows = [
    row({
      item_name: '排骨',
      base_unit: '包',
      target_unit: 'g',
      ratio: 500,
    }),
  ];

  it('matches either direction case-insensitively', () => {
    expect(findConversion(rows, '排骨', '包', 'g')?.ratio).toBe(500);
    expect(findConversion(rows, '排骨', 'G', '包')?.ratio).toBe(500);
  });

  it('returns null when item or units do not match', () => {
    expect(findConversion(rows, '山藥', '包', 'g')).toBeNull();
    expect(findConversion(rows, '排骨', '包', '包')).toBeNull();
  });
});
