import { describe, expect, it } from 'vitest';
import {
  aggregateWeekShortages,
  allocateIngredientsAgainstPool,
  buildPantryPool,
  shortageDeficit,
  type MealConfirmShortage,
} from './meal-plan';
import type { PantryItemRow } from './pantry';
import type { RecipeIngredientRow } from './recipe';
import { shortagesToShoppingItems } from '../agent/tools/execute';

function pantry(
  id: string,
  name: string,
  quantity: string,
  unit: string,
): PantryItemRow {
  return {
    id,
    name,
    quantity,
    unit,
    user_id: 'u1',
    notes: null,
    ingredient_id: null,
    created_at: 1,
    updated_at: 1,
  };
}

function ing(name: string, quantity: string, unit: string): RecipeIngredientRow {
  return {
    id: `ri-${name}`,
    recipe_id: 'r',
    name,
    quantity,
    unit,
    ingredient_id: null,
    sort_order: 0,
  };
}

// Live retest account pantry at the start of the plan.
const PANTRY = () => [
  pantry('p1', 'Milk', '2', 'l'),
  pantry('p2', 'Sugar', '1', 'kg'),
  pantry('p3', 'Olive Oil', '500', 'ml'),
  pantry('p4', 'Eggs', '12', 'pcs'),
  pantry('p5', 'Flour', '1', 'kg'),
  pantry('p6', 'Butter', '250', 'g'),
  pantry('p7', 'Rice', '1', 'kg'),
  pantry('p8', 'Pasta', '500', 'g'),
];

type Meal = { date: string; name: string; ingredients: RecipeIngredientRow[] };

// Wed 2026-11-18 .. Sun 2026-11-22 egg / rice / butter dishes.
const PLAN: Meal[] = [
  {
    date: '2026-11-18',
    name: 'Egg fried rice',
    ingredients: [
      ing('Rice', '300', 'g'),
      ing('Eggs', '3', 'pcs'),
      ing('Butter', '20', 'g'),
      ing('Sugar', '2', 'tsp'),
    ],
  },
  {
    date: '2026-11-19',
    name: 'Scrambled eggs',
    ingredients: [ing('Eggs', '4', 'pcs'), ing('Butter', '15', 'g')],
  },
  {
    date: '2026-11-20',
    name: 'Butter rice',
    ingredients: [ing('Rice', '250', 'g'), ing('Butter', '30', 'g')],
  },
  {
    date: '2026-11-21',
    name: 'Sweet omelette',
    ingredients: [
      ing('Eggs', '3', 'pcs'),
      ing('Sugar', '2', 'tsp'),
      ing('Flour', '2', 'tbsp'),
      ing('Butter', '10', 'g'),
    ],
  },
  {
    date: '2026-11-22',
    name: 'Egg rice bowl',
    ingredients: [
      ing('Rice', '300', 'g'),
      ing('Eggs', '2', 'pcs'),
      ing('Sugar', '1', 'tsp'),
    ],
  },
];

function run(plan: Meal[], rows = PANTRY()) {
  const pool = buildPantryPool(rows);
  const perMeal = plan.map(
    (m) => allocateIngredientsAgainstPool(m.ingredients, pool).shortages,
  );
  return { perMeal, week: aggregateWeekShortages(perMeal) };
}

describe('QA round 4: shortage math (Wed Nov 18 - Sun Nov 22 plan)', () => {
  it('2 tsp sugar / 1 tsp salt / tbsp flour are not shortages with kg / g stock', () => {
    const pool = buildPantryPool([...PANTRY(), pantry('p9', 'Salt', '500', 'g')]);
    const r = allocateIngredientsAgainstPool(
      [ing('Sugar', '2', 'tsp'), ing('Salt', '1', 'tsp'), ing('Flour', '3', 'tbsp')],
      pool,
    );
    expect(r.status).toBe('ok');
    expect(r.shortages).toEqual([]);
    // Pool is decremented in the stock unit: 1 kg - 2 tsp (~8.5 g)
    expect(pool.get('name:sugar')!.quantity).toBeLessThan(1);
    expect(pool.get('name:sugar')!.quantity).toBeGreaterThan(0.99);
  });

  it('300 g rice is not a shortage with 1 kg in the pantry', () => {
    const pool = buildPantryPool(PANTRY());
    const r = allocateIngredientsAgainstPool([ing('Rice', '300', 'g')], pool);
    expect(r.shortages).toEqual([]);
  });

  it('the whole egg / rice / butter plan needs nothing from the shop', () => {
    const { perMeal, week } = run(PLAN);
    expect(perMeal.flat()).toEqual([]);
    expect(week).toEqual([]);
    expect(shortagesToShoppingItems(week)).toEqual([]);
  });

  it('per-meal Need, week totals and shopping items agree when rice runs out', () => {
    // 300 + 300 + 300 + 300 = 1200 g vs 1 kg in stock.
    const plan: Meal[] = [18, 19, 20, 22].map((d) => ({
      date: `2026-11-${d}`,
      name: `Rice dish ${d}`,
      ingredients: [ing('Rice', '300', 'g')],
    }));
    const { perMeal, week } = run(plan);
    const deficits = perMeal.flat().map(shortageDeficit);
    expect(perMeal.map((l) => l.length)).toEqual([0, 0, 0, 1]);
    // Last meal needs 300 g but only 100 g is left -> 200 g to buy.
    expect(deficits).toEqual([200]);
    expect(week).toHaveLength(1);
    expect(week[0]).toMatchObject({ name: 'Rice', needed: 200, unit: 'g' });
    expect(shortagesToShoppingItems(week)).toEqual([
      { name: 'Rice', quantity: 200, unit: 'g' },
    ]);
    expect(deficits.reduce((a, b) => a + b, 0)).toBe(week[0]!.needed);
  });

  it('aggregates deficits (not gross needs) into the week total', () => {
    const lists: MealConfirmShortage[][] = [
      [{ name: 'Rice', needed: 300, available: 150, unit: 'g' }],
    ];
    expect(aggregateWeekShortages(lists)[0]).toMatchObject({ needed: 150 });
  });

  it('dry goods in volume units convert instead of unit_mismatch', () => {
    const pool = buildPantryPool([pantry('p', 'Sugar', '1', 'kg')]);
    const r = allocateIngredientsAgainstPool([ing('Sugar', '10', 'ml')], pool);
    expect(r.shortages).toEqual([]);
  });

  it('still reports a real unit mismatch for unknown density', () => {
    const pool = buildPantryPool([pantry('p', 'Mystery', '1', 'kg')]);
    const r = allocateIngredientsAgainstPool([ing('Mystery', '2', 'tsp')], pool);
    expect(r.shortages[0]?.reason).toBe('unit_mismatch');
  });
});
