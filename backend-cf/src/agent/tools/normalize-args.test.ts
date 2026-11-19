import { describe, expect, it } from 'vitest';
import { normalizeToolCallArgs } from './normalize-args';

const db = {} as D1Database;

describe('normalizeToolCallArgs: dry goods become grams before the approval card', () => {
  it('converts tsp / tbsp / odd ml of dry goods and keeps liquids in ml', async () => {
    const [call] = await normalizeToolCallArgs(db, 'u1', [
      {
        name: 'addItemsToShoppingList',
        arguments: {
          items: [
            { name: 'Sugar', quantity: 2, unit: 'tsp' },
            { name: 'Salt', quantity: 1, unit: 'tbsp' },
            { name: 'Sugar', quantity: 10, unit: 'ml' },
            { name: 'Soy sauce', quantity: 37.5, unit: 'ml' },
          ],
        },
      },
    ]);
    expect(call!.arguments.items).toEqual([
      { name: 'Sugar', quantity: 8.5, unit: 'g' },
      { name: 'Salt', quantity: 18, unit: 'g' },
      { name: 'Sugar', quantity: 8.5, unit: 'g' },
      { name: 'Soy sauce', quantity: 37.5, unit: 'ml' },
    ]);
  });

  it('normalizes recipe ingredient spoons of dry goods to grams', async () => {
    const [call] = await normalizeToolCallArgs(db, 'u1', [
      {
        name: 'createRecipe',
        arguments: {
          meal_name: 'Pancakes',
          ingredients: [
            { name: 'Flour', quantity: 2, unit: 'cup' },
            { name: 'Sugar', quantity: 1, unit: 'tbsp' },
          ],
        },
      },
    ]);
    const ings = call!.arguments.ingredients as Array<{ unit: string }>;
    expect(ings.map((i) => i.unit)).toEqual(['g', 'g']);
  });
});
