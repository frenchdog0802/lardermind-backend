import { describe, expect, it } from 'vitest';
import {
  aggregateWeekShortages,
  allocateIngredientsAgainstPool,
  buildPantryPool,
} from './meal-plan';
import type { PantryItemRow } from './pantry';
import type { RecipeIngredientRow } from './recipe';

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

describe('shortage-only allocation (unit conversion + name matching)', () => {
  it('does not report a shortage when pantry has enough in a convertible unit', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Milk', quantity: '1000', unit: 'ml' }),
      pantry({ id: 'p2', name: 'Sugar', quantity: '1', unit: 'kg' }),
      pantry({ id: 'p3', name: 'Olive Oil', quantity: '0.5', unit: 'l' }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [
        ing({ name: 'milk', quantity: '1', unit: 'l' }),
        ing({ name: 'sugar', quantity: '200', unit: 'g' }),
        ing({ name: 'olive oil', quantity: '7', unit: 'tbsp' }),
      ],
      pool,
    );
    expect(result.status).toBe('ok');
    expect(result.shortages).toEqual([]);
    // Pool is decremented in the pantry's own unit (1 kg - 200 g = 0.8 kg).
    expect(pool.get('name:sugar')?.quantity).toBeCloseTo(0.8, 6);
  });

  it('matches name variants: plural, case, filler adjectives', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Eggs', quantity: '6', unit: 'pcs' }),
      pantry({ id: 'p2', name: 'Tomatoes', quantity: '4', unit: 'pcs' }),
      pantry({ id: 'p3', name: 'Bananas', quantity: '3', unit: 'pcs' }),
      pantry({ id: 'p4', name: 'Whole Milk', quantity: '1', unit: 'l' }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [
        ing({ name: 'egg', quantity: '4', unit: 'pcs' }),
        ing({ name: 'Tomato', quantity: '4', unit: 'pcs' }),
        ing({ name: 'banana', quantity: '2', unit: 'pcs' }),
        ing({ name: 'milk', quantity: '500', unit: 'ml' }),
      ],
      pool,
    );
    expect(result.status).toBe('ok');
    expect(result.shortages).toEqual([]);
  });

  it('only the remainder is short when pantry has some but not enough', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Sugar', quantity: '100', unit: 'g' }),
      pantry({ id: 'p2', name: 'Milk', quantity: '300', unit: 'ml' }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [
        ing({ name: 'Sugar', quantity: '0.25', unit: 'kg' }),
        ing({ name: 'Milk', quantity: '1', unit: 'l' }),
      ],
      pool,
    );
    expect(result.status).toBe('short');
    const week = aggregateWeekShortages([result.shortages]);
    expect(week).toEqual([
      { name: 'Sugar', needed: 0.15, available: 0, unit: 'kg' },
      { name: 'Milk', needed: 0.7, available: 0, unit: 'l' },
    ]);
  });

  it('uses every pantry row for a name (same item in two units)', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Milk', quantity: '500', unit: 'ml' }),
      pantry({ id: 'p2', name: 'milk', quantity: '1', unit: 'l' }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [ing({ name: 'Milk', quantity: '1.2', unit: 'l' })],
      pool,
    );
    expect(result.status).toBe('ok');
  });

  it('keeps count vs weight as a full shortage flagged unit_mismatch', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Bread', quantity: '1', unit: 'pcs' }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [ing({ name: 'Bread', quantity: '200', unit: 'g' })],
      pool,
    );
    expect(result.shortages[0]).toMatchObject({
      needed: 200,
      available: 0,
      reason: 'unit_mismatch',
    });
  });

  it('week aggregation merges convertible units and name variants', () => {
    const week = aggregateWeekShortages([
      [{ name: 'Egg', needed: 4, available: 0, unit: 'pcs' }],
      [{ name: 'eggs', needed: 4, available: 0, unit: 'pcs' }],
      [{ name: 'Milk', needed: 500, available: 0, unit: 'ml' }],
      [{ name: 'milk', needed: 1, available: 0, unit: 'l' }],
    ]);
    expect(week).toEqual([
      { name: 'Egg', needed: 8, available: 0, unit: 'pcs' },
      { name: 'Milk', needed: 1500, available: 0, unit: 'ml' },
    ]);
  });
});
