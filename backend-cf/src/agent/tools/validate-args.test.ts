import { describe, expect, it } from 'vitest';
import { validateToolArgs } from './validate-args';

describe('validateToolArgs', () => {
  it('requires addPantryItems items', () => {
    const errors = validateToolArgs('addPantryItems', {});
    expect(errors.some((error) => error.includes('items'))).toBe(true);
  });

  it('accepts a well-formed add', () => {
    expect(
      validateToolArgs('addPantryItems', {
        items: [{ name: 'milk', quantity: 1 }],
      }),
    ).toEqual([]);
  });
});
