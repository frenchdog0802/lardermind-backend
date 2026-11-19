import { describe, expect, it } from 'vitest';
import { argsSummary, isMutatingTool, toPendingTools } from './hitl';
import {
  aggregateCard,
  mealPlanUpdatedCardData,
  mealSuggestionsCardData,
  recipeCreatedCardData,
} from './cards';

describe('HITL helpers', () => {
  it('classifies mutating tools', () => {
    expect(isMutatingTool('addPantryItems')).toBe(true);
    expect(isMutatingTool('updatePantryItems')).toBe(true);
    expect(isMutatingTool('removePantryItems')).toBe(true);
    expect(isMutatingTool('planMeals')).toBe(true);
    expect(isMutatingTool('listPantry')).toBe(false);
    expect(isMutatingTool('getMealPlanAvailability')).toBe(false);
    expect(isMutatingTool('suggestMealsFromPantry')).toBe(false);
  });

  it('summarizes tool args', () => {
    expect(
      argsSummary('addPantryItems', {
        items: [{ name: 'eggs' }, { name: 'milk' }],
      }),
    ).toBe('eggs, milk');
    expect(
      argsSummary('updatePantryItems', {
        items: [{ name: '排骨', delta: -3 }],
      }),
    ).toBe('排骨 -3');
    expect(
      argsSummary('removePantryItems', {
        items: [{ name: '排骨' }],
      }, 'zh'),
    ).toBe('刪除 排骨');
    // English chats no longer get a hard-coded Chinese verb.
    expect(
      argsSummary('removePantryItems', {
        items: [{ name: 'pork ribs' }],
      }),
    ).toBe('remove pork ribs');
    expect(
      argsSummary('createRecipe', { meal_name: 'Pasta' }),
    ).toBe('Pasta');
    expect(
      argsSummary('addRecipeToMenu', {
        meal_name: 'Soup',
        serving_date: '2026-09-22',
      }),
    ).toBe('Soup on 2026-09-22');
    expect(
      argsSummary('planMeals', {
        meals: [
          {
            meal_name: 'A',
            meal_type: 'dinner',
            serving_date: '2026-10-15',
          },
          {
            meal_name: 'B',
            meal_type: 'dinner',
            serving_date: '2026-10-16',
          },
        ],
      }),
    ).toBe('2 meals (2026-10-15…2026-10-16): 2026-10-15 A; 2026-10-16 B');
  });

  it('planMeals approval lists every proposed dish per date (main + side)', () => {
    const days = ['2026-11-20', '2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'];
    const meals = days.flatMap((d, i) => [
      { meal_name: `Main ${i + 1}`, meal_type: 'dinner', serving_date: d },
      { meal_name: `Side ${i + 1}`, meal_type: 'dinner', serving_date: d },
    ]);
    const summary = argsSummary('planMeals', { meals });
    expect(summary).toBe(
      '10 meals (2026-11-20…2026-11-24): 2026-11-20 Main 1, Side 1; 2026-11-21 Main 2, Side 2; ' +
        '2026-11-22 Main 3, Side 3; 2026-11-23 Main 4, Side 4; 2026-11-24 Main 5, Side 5',
    );
  });

  it('localises planMeals and other summaries for Chinese chats', () => {
    expect(
      argsSummary(
        'planMeals',
        {
          meals: [
            { meal_name: '紅燒排骨', meal_type: 'dinner', serving_date: '2026-11-20' },
            { meal_name: '蒜炒菠菜', meal_type: 'dinner', serving_date: '2026-11-20' },
          ],
        },
        'zh',
      ),
    ).toBe('2 道菜 (2026-11-20): 2026-11-20 紅燒排骨, 蒜炒菠菜');
    expect(argsSummary('updatePreferences', {}, 'zh')).toBe('更新偏好設定');
    expect(argsSummary('updatePreferences', {})).toBe('update preferences');
    expect(
      toPendingTools(
        [{ id: 'x', name: 'removePantryItems', arguments: { items: [{ name: '鹽' }] } }],
        'zh',
      ),
    ).toEqual([{ name: 'removePantryItems', argsSummary: '刪除 鹽', id: 'x' }]);
  });

  it('planMeals approval caps the dish list and labels mixed meal types', () => {
    const meals = Array.from({ length: 15 }, (_, i) => ({
      meal_name: `Dish ${i}`,
      meal_type: i % 2 ? 'lunch' : 'dinner',
      serving_date: `2026-11-${String(10 + Math.floor(i / 2)).padStart(2, '0')}`,
    }));
    const summary = argsSummary('planMeals', { meals });
    expect(summary.startsWith('15 meals (2026-11-10…2026-11-17): 2026-11-10 dinner: Dish 0 / lunch: Dish 1;')).toBe(true);
    expect(summary.endsWith(' +3 more')).toBe(true);
    expect(summary).not.toContain('Dish 12');
  });

  it('summaries include quantities and date ranges for readable approval cards', () => {
    expect(
      argsSummary('addItemsToShoppingList', {
        items: [
          { name: 'Salt', quantity: 18, unit: 'g' },
          { name: 'Soy sauce', quantity: 37.5, unit: 'ml' },
        ],
      }),
    ).toBe('Salt 18 g, Soy sauce 37.5 ml');
    expect(
      argsSummary('addMealPlanShortagesToShoppingList', {
        from: '2026-11-18',
        to: '2026-11-22',
      }),
    ).toBe('missing ingredients, 2026-11-18 – 2026-11-22');
  });

  it('maps pending tool summaries', () => {
    const pending = toPendingTools([
      {
        id: '1',
        name: 'addPantryItems',
        arguments: { items: [{ name: 'rice' }] },
      },
    ]);
    expect(pending).toEqual([
      { name: 'addPantryItems', argsSummary: 'rice', id: '1' },
    ]);
  });
});

describe('card aggregation', () => {
  it('returns text when no events', () => {
    expect(aggregateCard([])).toEqual({ type: 'text', data: {} });
  });

  it('prefers last mutating card', () => {
    expect(
      aggregateCard([
        {
          toolName: 'suggestMealsFromPantry',
          cardType: 'meal_suggestions',
          data: { suggestions: [] },
        },
        {
          toolName: 'addPantryItems',
          cardType: 'pantry_updated',
          data: { items: [{ name: 'eggs' }] },
        },
      ]),
    ).toEqual({
      type: 'pantry_updated',
      data: { items: [{ name: 'eggs' }] },
    });
  });

  it('uses multi_action for distinct mutating types', () => {
    const result = aggregateCard([
      {
        toolName: 'addPantryItems',
        cardType: 'pantry_updated',
        data: { items: [] },
      },
      {
        toolName: 'createRecipe',
        cardType: 'recipe_created',
        data: {
          recipeId: 'r1',
          recipeName: 'Pasta',
          ingredientCount: 0,
          steps: [],
        },
      },
    ]);
    expect(result.type).toBe('multi_action');
    expect(result.data.actions).toHaveLength(2);
  });
});

describe('recipeCreatedCardData', () => {
  it('maps RecipeDto fields to flat client card shape', () => {
    expect(
      recipeCreatedCardData({
        id: 'r1',
        meal_name: '燙青菜',
        ingredients: [{ name: '青菜' }, { name: '鹽' }],
        instructions: ['燙熟', '加鹽'],
      }),
    ).toEqual({
      recipeId: 'r1',
      recipeName: '燙青菜',
      ingredientCount: 2,
      ingredients: [{ name: '青菜' }, { name: '鹽' }],
      steps: ['燙熟', '加鹽'],
    });
    expect(
      recipeCreatedCardData({
        id: 'r2',
        meal_name: 'Rice',
        ingredients: [{ name: 'Rice', quantity: 300, unit: 'g' }],
        instructions: [],
      }).ingredients,
    ).toEqual([{ name: 'Rice', quantity: 300, unit: 'g' }]);
    expect(
      mealPlanUpdatedCardData({
        id: 'p1',
        meal_name: '燙青菜',
        meal_type: 'dinner',
        serving_date: '2026-10-06',
      }),
    ).toEqual({
      mealPlanId: 'p1',
      recipeName: '燙青菜',
      mealType: 'dinner',
      servingDate: '2026-10-06',
    });
  });
});

describe('mealSuggestionsCardData', () => {
  it('maps suggestion DTOs to flat client card shape', () => {
    expect(
      mealSuggestionsCardData([
        {
          id: 'r1',
          meal_name: '山藥排骨湯',
          matchScore: 50,
          missingIngredients: ['山藥'],
        },
      ]),
    ).toEqual({
      suggestions: [
        {
          recipeId: 'r1',
          recipeName: '山藥排骨湯',
          matchScore: 50,
          missingIngredients: ['山藥'],
        },
      ],
    });
  });
});
