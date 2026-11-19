import { describe, expect, it } from 'vitest';
import {
  canonicalUnit,
  ingredientNameKey,
  namesMatch,
  normalizeToolUnit,
  standardConvert,
  convertQty,
  normalizeToolQuantity,
} from './units';

describe('canonicalUnit', () => {
  it('maps aliases onto app units and rejects invented ones', () => {
    expect(canonicalUnit('Grams')).toBe('g');
    expect(canonicalUnit('tablespoons')).toBe('tbsp');
    expect(canonicalUnit('litre')).toBe('l');
    expect(canonicalUnit('bottle')).toBeNull();
    expect(canonicalUnit('carton')).toBeNull();
    expect(canonicalUnit('loaf')).toBeNull();
    expect(canonicalUnit('')).toBeNull();
  });
});

describe('standardConvert', () => {
  it('converts within weight and volume families only', () => {
    expect(standardConvert(1, 'l', 'ml')).toBe(1000);
    expect(standardConvert(2, 'tbsp', 'ml')).toBe(30);
    expect(standardConvert(1, 'kg', 'g')).toBe(1000);
    expect(standardConvert(1, 'g', 'ml')).toBeNull();
    expect(standardConvert(1, 'pcs', 'g')).toBeNull();
    expect(standardConvert(3, 'pcs', 'pcs')).toBe(3);
  });
});

describe('ingredientNameKey / namesMatch', () => {
  it('treats case, plurals and filler adjectives as the same item', () => {
    expect(namesMatch('Eggs', 'egg')).toBe(true);
    expect(namesMatch('Tomatoes', 'tomato')).toBe(true);
    expect(namesMatch('Bananas', 'banana')).toBe(true);
    expect(namesMatch('Extra Virgin Olive Oil', 'olive oil')).toBe(true);
    expect(namesMatch('Whole Milk', 'milk')).toBe(true);
    expect(namesMatch('milk', 'oil')).toBe(false);
    expect(ingredientNameKey('Eggs (large)')).toBe('egg');
  });
});

describe('normalizeToolUnit', () => {
  it('maps invented units to sensible app units', () => {
    expect(normalizeToolUnit('milk', 'carton', 1)).toBe('l');
    expect(normalizeToolUnit('milk', 'bottle', 1)).toBe('l');
    expect(normalizeToolUnit('milk', 'pcs', 1)).toBe('pcs');
    expect(normalizeToolUnit('bread', 'loaf', 1)).toBe('pcs');
    expect(normalizeToolUnit('milk', '', 500)).toBe('ml');
    expect(normalizeToolUnit('cheese', undefined, 200)).toBe('g');
    expect(normalizeToolUnit('eggs', '', 6)).toBe('pcs');
    expect(normalizeToolUnit('flour', 'cups', 2)).toBe('cup');
  });

  it('never returns a unit outside the app list', () => {
    for (const raw of ['bottle', 'pack', 'loaf', 'box', '', 'zzz']) {
      expect(canonicalUnit(normalizeToolUnit('mystery', raw, 1))).not.toBeNull();
    }
  });
});

describe('round 4: density conversion and dry-good normalization', () => {
  it('converts tsp / tbsp of dry goods to grams', () => {
    expect(convertQty(2, 'tsp', 'g', 'sugar')).toBeCloseTo(8.5, 1);
    expect(convertQty(1, 'tsp', 'g', 'salt')).toBeCloseTo(6, 1);
    expect(convertQty(1, 'kg', 'tsp', 'sugar')).toBeGreaterThan(100);
    expect(convertQty(2, 'tsp', 'g', 'unknown thing')).toBeNull();
    expect(convertQty(2, 'pcs', 'g', 'sugar')).toBeNull();
  });

  it('normalizes dry goods to g and keeps liquids in ml', () => {
    expect(normalizeToolQuantity('Sugar', 2, 'tsp')).toEqual({ quantity: 8.5, unit: 'g' });
    expect(normalizeToolQuantity('Salt', 3, 'tablespoons')).toEqual({ quantity: 54, unit: 'g' });
    expect(normalizeToolQuantity('Flour', 1, 'cup').unit).toBe('g');
    // guard: odd model output "Sugar 10 ml" never persists as ml
    expect(normalizeToolQuantity('Sugar', 10, 'ml')).toEqual({ quantity: 8.5, unit: 'g' });
    expect(normalizeToolQuantity('Soy sauce', 37.5, 'ml')).toEqual({ quantity: 37.5, unit: 'ml' });
    expect(normalizeToolQuantity('Olive oil', 2, 'tbsp')).toEqual({ quantity: 2, unit: 'tbsp' });
    expect(normalizeToolQuantity('Sugar', 200, 'g')).toEqual({ quantity: 200, unit: 'g' });
  });
});
