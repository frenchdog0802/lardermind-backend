import { describe, expect, it } from 'vitest';
import {
  aggregateWeekShortages,
  allocateIngredientsAgainstPool,
  buildPantryPool,
  shortageDeficit,
} from './meal-plan';
import type { PantryItemRow } from './pantry';
import type { RecipeIngredientRow } from './recipe';
import {
  convertQtyBetweenItems,
  cookedStateFactor,
  ingredientNameKey,
  namesMatch,
} from './units';

function pantry(
  partial: Partial<PantryItemRow> & { id: string; name: string },
): PantryItemRow {
  return {
    user_id: 'u1',
    quantity: '0',
    unit: 'pcs',
    notes: null,
    ingredient_id: null,
    created_at: 1,
    updated_at: 1,
    ...partial,
  };
}

function ing(
  partial: Partial<RecipeIngredientRow> & { name: string },
): RecipeIngredientRow {
  return {
    id: 'ri',
    recipe_id: 'r1',
    quantity: '1',
    unit: 'pcs',
    ingredient_id: null,
    sort_order: 0,
    ...partial,
  };
}

describe('cooked / raw / dry staples are one item', () => {
  it('name keys ignore cook state for staples only', () => {
    expect(ingredientNameKey('Cooked Rice')).toBe('rice');
    expect(ingredientNameKey('uncooked rice')).toBe('rice');
    expect(ingredientNameKey('Dry Pasta')).toBe('pasta');
    expect(ingredientNameKey('cooked spaghetti')).toBe('spaghetti');
    expect(namesMatch('cooked rice', 'Raw Rice')).toBe(true);
    // non-staples keep their state word (cooked chicken is not raw chicken)
    expect(ingredientNameKey('cooked chicken')).toBe('cooked chicken');
    expect(ingredientNameKey('dry white wine')).toBe('dry white wine');
  });

  it('cooked <-> dry ratios: rice 1/3, pasta 1/2.25', () => {
    expect(convertQtyBetweenItems(200, 'g', 'g', 'rice', 'cooked rice')).toBeCloseTo(600, 6);
    expect(convertQtyBetweenItems(600, 'g', 'g', 'cooked rice', 'rice')).toBeCloseTo(200, 6);
    expect(convertQtyBetweenItems(225, 'g', 'g', 'dry pasta', 'cooked pasta')).toBeCloseTo(506.25, 6);
    expect(convertQtyBetweenItems(1, 'kg', 'g', 'rice', 'cooked rice')).toBeCloseTo(3000, 6);
    expect(cookedStateFactor('chicken', 'cooked chicken')).toBe(1);
    expect(cookedStateFactor('cooked rice', 'cooked rice')).toBe(1);
  });

  it('1 kg raw rice covers 600 g cooked rice (no shortage)', () => {
    const pool = buildPantryPool([pantry({ id: 'p1', name: 'Rice', quantity: '1', unit: 'kg' })]);
    const result = allocateIngredientsAgainstPool(
      [ing({ name: 'cooked rice', quantity: '600', unit: 'g' })],
      pool,
    );
    expect(result.status).toBe('ok');
    expect(result.shortages).toEqual([]);
    // 600 g cooked consumed 200 g dry -> 800 g left
    expect(pool.get('name:rice')?.quantity).toBeCloseTo(0.8, 6);
  });

  it('cooked pasta is covered by dry pasta and reports a true deficit in need terms', () => {
    const enough = buildPantryPool([pantry({ id: 'p1', name: 'Dry Pasta', quantity: '400', unit: 'g' })]);
    expect(
      allocateIngredientsAgainstPool([ing({ name: 'cooked pasta', quantity: '900', unit: 'g' })], enough)
        .status,
    ).toBe('ok'); // 900 / 2.25 = 400 g dry

    const short = buildPantryPool([pantry({ id: 'p1', name: 'pasta', quantity: '100', unit: 'g' })]);
    const r = allocateIngredientsAgainstPool(
      [ing({ name: 'cooked pasta', quantity: '900', unit: 'g' })],
      short,
    );
    expect(r.shortages).toHaveLength(1);
    expect(shortageDeficit(r.shortages[0]!)).toBeCloseTo(675, 3); // 900 - 100*2.25
  });

  it('cooked rice in the pantry covers a raw-rice need too (reverse direction)', () => {
    const pool = buildPantryPool([pantry({ id: 'p1', name: 'Cooked Rice', quantity: '600', unit: 'g' })]);
    const r = allocateIngredientsAgainstPool([ing({ name: 'rice', quantity: '200', unit: 'g' })], pool);
    expect(r.status).toBe('ok');
  });

  it('non-staples are unaffected: cooked chicken does not match raw chicken', () => {
    const pool = buildPantryPool([pantry({ id: 'p1', name: 'chicken', quantity: '500', unit: 'g' })]);
    const r = allocateIngredientsAgainstPool([ing({ name: 'cooked chicken', quantity: '200', unit: 'g' })], pool);
    expect(r.status).toBe('short');
  });
});

describe('Need and week totals share one shortage (salt 18 g)', () => {
  /** Per-meal Need lists salt iff the week aggregate lists it, with the same numbers. */
  function needAndWeek(rows: PantryItemRow[]) {
    const pool = buildPantryPool(rows);
    const meal = allocateIngredientsAgainstPool(
      [ing({ name: 'Salt', quantity: '18', unit: 'g' })],
      pool,
    );
    const week = aggregateWeekShortages([meal.shortages]);
    return { meal, week };
  }

  it('salt in grams: neither Need nor week totals list it', () => {
    const { meal, week } = needAndWeek([pantry({ id: 'p1', name: 'Salt', quantity: '100', unit: 'g' })]);
    expect(meal.shortages).toEqual([]);
    expect(week).toEqual([]);
  });

  it('salt in a convertible volume unit still covers 18 g', () => {
    const { meal, week } = needAndWeek([pantry({ id: 'p1', name: 'salt', quantity: '2', unit: 'tbsp' })]);
    expect(meal.shortages).toEqual([]);
    expect(week).toEqual([]);
  });

  it('salt saved as 100 pcs (the round-4 bug) is a unit_mismatch that BOTH Need and totals list', () => {
    const { meal, week } = needAndWeek([pantry({ id: 'p1', name: 'Salt', quantity: '100', unit: 'pcs' })]);
    expect(meal.shortages).toHaveLength(1);
    expect(meal.shortages[0]).toMatchObject({ name: 'Salt', needed: 18, unit: 'g', reason: 'unit_mismatch' });
    expect(week).toEqual([{ name: 'Salt', needed: 18, available: 0, unit: 'g' }]);
  });

  it('a genuine shortage appears identically in Need and totals', () => {
    const { meal, week } = needAndWeek([pantry({ id: 'p1', name: 'Salt', quantity: '10', unit: 'g' })]);
    expect(shortageDeficit(meal.shortages[0]!)).toBe(8);
    expect(week).toEqual([{ name: 'Salt', needed: 8, available: 0, unit: 'g' }]);
  });
});
