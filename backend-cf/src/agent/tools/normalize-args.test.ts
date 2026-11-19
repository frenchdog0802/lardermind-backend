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

describe('planMeals alternatives', () => {
  it('keeps one dish per entry when the name offers alternatives', async () => {
    const [call] = await normalizeToolCallArgs(db, 'u1', [
      {
        name: 'planMeals',
        arguments: {
          meals: [
            { meal_name: 'Buttered Carrots, or Sliced Tomato Salad if you have tomatoes', meal_type: 'dinner', serving_date: '2026-11-20' },
            { meal_name: 'Grilled Chicken', meal_type: 'dinner', serving_date: '2026-11-20' },
          ],
        },
      },
    ]);
    const meals = (call!.arguments as { meals: Array<{ meal_name: string }> }).meals;
    expect(meals.map((m) => m.meal_name)).toEqual(['Buttered Carrots', 'Grilled Chicken']);
  });

  it('collapses createRecipe alternatives and dedupes identical slot entries', async () => {
    const [recipe, plan] = await normalizeToolCallArgs(db, 'u1', [
      { name: 'createRecipe', arguments: { meal_name: 'Carrots or Tomato Salad', ingredients: [] } },
      {
        name: 'planMeals',
        arguments: {
          meals: [
            { meal_name: 'Carrots or Salad', meal_type: 'lunch', serving_date: '2026-11-20' },
            { meal_name: 'Carrots', meal_type: 'lunch', serving_date: '2026-11-20' },
          ],
        },
      },
    ]);
    expect((recipe!.arguments as { meal_name: string }).meal_name).toBe('Carrots');
    expect((plan!.arguments as { meals: unknown[] }).meals).toHaveLength(1);
  });
});
