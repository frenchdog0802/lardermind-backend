import { describe, expect, it } from 'vitest';
import {
  canonicalUnit,
  ingredientNameKey,
  namesMatch,
  normalizeToolUnit,
  standardConvert,
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
