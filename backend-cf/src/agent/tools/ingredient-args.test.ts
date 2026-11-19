import { describe, expect, it } from 'vitest';
import { ingredientInputsFromArgs } from './execute';

describe('ingredientInputsFromArgs', () => {
  it('preserves cup/tbsp units and does not invent ml', () => {
    const out = ingredientInputsFromArgs({
      ingredients: [
        { name: 'rice', quantity: 1.5, unit: 'cup' },
        { name: 'soy sauce', quantity: 1, unit: 'tbsp' },
      ],
    });
    expect(out).toEqual([
      { name: 'rice', quantity: 1.5, unit: 'cup' },
      { name: 'soy sauce', quantity: 1, unit: 'tbsp' },
    ]);
  });

  it('always yields an app unit: omitted units get a sensible default, invented ones are mapped', () => {
    const out = ingredientInputsFromArgs({
      ingredients: [
        { name: 'oil', quantity: 2 },
        { name: 'bread', quantity: 1, unit: 'loaf' },
        { name: 'milk', quantity: 1, unit: 'carton' },
        { name: 'flour', quantity: 250 },
      ],
    });
    expect(out.map((i) => i.unit)).toEqual(['tbsp', 'pcs', 'l', 'g']);
  });
});
