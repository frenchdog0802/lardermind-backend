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

  it('does not default non-zero quantity to pcs when unit omitted', () => {
    const out = ingredientInputsFromArgs({
      ingredients: [{ name: 'oil', quantity: 2 }],
    });
    expect(out[0]?.unit).toBe('');
  });
});
