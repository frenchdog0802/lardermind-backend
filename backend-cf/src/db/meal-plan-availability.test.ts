import { describe, expect, it } from 'vitest';
import {
  aggregateWeekShortages,
  allocateIngredientsAgainstPool,
  buildPantryPool,
  defaultSoftReserveRange,
  softReserveFromAllocatedPool,
  type MealConfirmShortage,
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

describe('buildPantryPool + allocateIngredientsAgainstPool', () => {
  it('returns ok when pantry covers needs', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Egg', quantity: '6', unit: 'pcs' }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [ing({ name: 'Egg', quantity: '2', unit: 'pcs' })],
      pool,
    );
    expect(result.status).toBe('ok');
    expect(result.shortages).toEqual([]);
    expect(pool.get('name:egg')?.quantity).toBe(4);
  });

  it('returns short when ingredient missing', () => {
    const pool = buildPantryPool([]);
    const result = allocateIngredientsAgainstPool(
      [ing({ name: 'Chicken', quantity: '500', unit: 'g' })],
      pool,
    );
    expect(result.status).toBe('short');
    expect(result.shortages).toEqual([
      { name: 'Chicken', needed: 500, available: 0, unit: 'g' },
    ]);
  });

  it('returns unknown without recipe', () => {
    const pool = buildPantryPool([
      pantry({ id: 'p1', name: 'Egg', quantity: '6' }),
    ]);
    const result = allocateIngredientsAgainstPool([], pool, {
      hasRecipeId: false,
      recipeFound: false,
    });
    expect(result.status).toBe('unknown');
    expect(result.shortages).toEqual([]);
    expect(pool.get('name:egg')?.quantity).toBe(6);
  });

  it('second meal goes short after first consumes the pool', () => {
    const pool = buildPantryPool([
      pantry({
        id: 'p1',
        name: 'Chicken',
        quantity: '300',
        unit: 'g',
        ingredient_id: 'ing-ch',
      }),
    ]);
    const meal1 = allocateIngredientsAgainstPool(
      [
        ing({
          name: 'Chicken',
          quantity: '250',
          unit: 'g',
          ingredient_id: 'ing-ch',
        }),
      ],
      pool,
    );
    const meal2 = allocateIngredientsAgainstPool(
      [
        ing({
          name: 'Chicken',
          quantity: '200',
          unit: 'g',
          ingredient_id: 'ing-ch',
        }),
      ],
      pool,
    );
    expect(meal1.status).toBe('ok');
    expect(meal2.status).toBe('short');
    expect(meal2.shortages[0]?.available).toBe(50);
    expect(meal2.shortages[0]?.needed).toBe(200);
  });
});

describe('aggregateWeekShortages', () => {
  it('sums deficits for shopping', () => {
    const lists: MealConfirmShortage[][] = [
      [{ name: 'Egg', needed: 4, available: 2, unit: 'pcs' }],
      [{ name: 'Egg', needed: 3, available: 0, unit: 'pcs' }],
    ];
    const week = aggregateWeekShortages(lists);
    expect(week).toEqual([
      { name: 'Egg', needed: 5, available: 0, unit: 'pcs' },
    ]);
  });
});

describe('softReserveFromAllocatedPool', () => {
  it('reports reserved and available after two meal allocations', () => {
    const rows = [
      pantry({
        id: 'p1',
        name: '排骨',
        quantity: '10',
        unit: '包',
      }),
    ];
    const pool = buildPantryPool(rows);
    allocateIngredientsAgainstPool(
      [ing({ name: '排骨', quantity: '1', unit: '包' })],
      pool,
    );
    allocateIngredientsAgainstPool(
      [ing({ name: '排骨', quantity: '1', unit: '包' })],
      pool,
    );
    const soft = softReserveFromAllocatedPool(rows, pool);
    expect(soft).toEqual([
      {
        pantry_item_id: 'p1',
        name: '排骨',
        unit: '包',
        on_hand: 10,
        reserved: 2,
        available: 8,
      },
    ]);
  });

  it('defaultSoftReserveRange spans 14 days', () => {
    expect(defaultSoftReserveRange('2026-10-15')).toEqual({
      from: '2026-10-15',
      to: '2026-10-29',
    });
  });

  it('does not silently allocate across mismatched units (包 vs g)', () => {
    const pool = buildPantryPool([
      pantry({
        id: 'p1',
        name: '排骨',
        quantity: '10',
        unit: '包',
      }),
    ]);
    const result = allocateIngredientsAgainstPool(
      [ing({ name: '排骨', quantity: '500', unit: 'g' })],
      pool,
    );
    expect(result.status).toBe('short');
    expect(result.shortages[0]).toMatchObject({
      name: '排骨',
      needed: 500,
      available: 0,
      unit: 'g',
      reason: 'unit_mismatch',
    });
    expect(pool.get('name:排骨')?.quantity).toBe(10);
  });

  it('closed-loop: dropping a meal from allocation restores available (cancel model)', () => {
    const rows = [
      pantry({
        id: 'p1',
        name: 'Chicken',
        quantity: '250',
        unit: 'g',
      }),
    ];
    const withTwoMeals = buildPantryPool(rows);
    allocateIngredientsAgainstPool(
      [ing({ name: 'Chicken', quantity: '200', unit: 'g' })],
      withTwoMeals,
    );
    allocateIngredientsAgainstPool(
      [ing({ name: 'Chicken', quantity: '200', unit: 'g' })],
      withTwoMeals,
    );
    expect(softReserveFromAllocatedPool(rows, withTwoMeals)[0]).toMatchObject({
      on_hand: 250,
      reserved: 250,
      available: 0,
    });

    const afterCancelFirst = buildPantryPool(rows);
    allocateIngredientsAgainstPool(
      [ing({ name: 'Chicken', quantity: '200', unit: 'g' })],
      afterCancelFirst,
    );
    expect(softReserveFromAllocatedPool(rows, afterCancelFirst)[0]).toMatchObject({
      on_hand: 250,
      reserved: 200,
      available: 50,
    });
  });
});
