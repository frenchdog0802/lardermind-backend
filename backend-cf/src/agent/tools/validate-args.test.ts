import { describe, expect, it } from 'vitest';
import { invalidArgsToolContent, validateToolArgs } from './validate-args';

const dinner = (meal_name: string, serving_date = '2026-11-20') => ({
  meal_name,
  meal_type: 'dinner',
  serving_date,
});

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

  it('rejects empty / whitespace item names and non-positive quantities', () => {
    expect(validateToolArgs('addPantryItems', { items: [{ name: '  ', quantity: 1 }] })).toEqual([
      'items[0].name must not be empty',
    ]);
    expect(validateToolArgs('addItemsToShoppingList', { items: [{ name: 'salt', quantity: 0 }] })).toEqual([
      'items[0].quantity must be greater than 0',
    ]);
    expect(validateToolArgs('addItemsToShoppingList', { items: [] })).toEqual([
      'items must have at least 1 item(s)',
    ]);
    expect(validateToolArgs('createRecipe', { meal_name: '' })).toEqual([
      'meal_name must not be empty',
    ]);
  });

  it('planMeals: meal names, YYYY-MM-DD dates, meal_type enum', () => {
    expect(validateToolArgs('planMeals', { meals: [dinner('Pork'), dinner('Spinach')] })).toEqual([]);
    const errors = validateToolArgs('planMeals', {
      meals: [
        dinner(''),
        dinner('Soup', '11/20'),
        { meal_name: 'Rice', meal_type: 'supper', serving_date: '2026-11-21' },
      ],
    });
    expect(errors).toEqual([
      'meals[0].meal_name must not be empty',
      'meals[1].serving_date must be a YYYY-MM-DD date (got "11/20")',
      'meals[2].meal_type must be one of: breakfast, lunch, dinner, snack',
    ]);
  });

  it('planMeals: at most 28 entries, with the cap guidance', () => {
    const meals = Array.from({ length: 29 }, (_, i) => dinner(`Dish ${i}`));
    const errors = validateToolArgs('planMeals', { meals });
    expect(errors[0]).toBe('meals has 29 items; at most 28 are allowed per call');
    expect(errors[1]).toMatch(/schedule the first 28 and tell the user the rest were not scheduled/);
    expect(validateToolArgs('planMeals', { meals: meals.slice(0, 28) })).toEqual([]);
  });

  it('addRecipeToMenu needs recipe_id or meal_name and a valid date', () => {
    expect(
      validateToolArgs('addRecipeToMenu', { meal_type: 'dinner', serving_date: '2026-11-20' }),
    ).toEqual(['addRecipeToMenu needs recipe_id or meal_name (at least one)']);
    expect(
      validateToolArgs('addRecipeToMenu', {
        meal_name: ' ',
        recipe_id: '',
        meal_type: 'dinner',
        serving_date: '2026-11-20',
      }),
    ).toEqual(['addRecipeToMenu needs recipe_id or meal_name (at least one)']);
    expect(
      validateToolArgs('addRecipeToMenu', { recipe_id: 'r1', meal_type: 'dinner', serving_date: '2026-11-20' }),
    ).toEqual([]);
    expect(
      validateToolArgs('addRecipeToMenu', { meal_name: 'Soup', meal_type: 'dinner', serving_date: 'tomorrow' }),
    ).toEqual(['serving_date must be a YYYY-MM-DD date (got "tomorrow")']);
  });

  it('shortage range dates must be YYYY-MM-DD', () => {
    expect(
      validateToolArgs('addMealPlanShortagesToShoppingList', { from: '2026-11-20', to: 'next week' }),
    ).toEqual(['to must be a YYYY-MM-DD date (got "next week")']);
  });

  it('invalidArgsToolContent tells the model nothing was saved', () => {
    const body = JSON.parse(invalidArgsToolContent('planMeals', ['x']));
    expect(body).toMatchObject({ error: 'invalid_arguments', tool: 'planMeals', errors: ['x'] });
    expect(body.message).toMatch(/Nothing was saved and no approval was requested/);
  });
});
