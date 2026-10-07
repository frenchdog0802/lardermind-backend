import { describe, expect, it } from 'vitest';
import { argsSummary, isMutatingTool, toPendingTools } from './hitl';
import {
  aggregateCard,
  mealPlanUpdatedCardData,
  recipeCreatedCardData,
} from './cards';

describe('HITL helpers', () => {
  it('classifies mutating tools', () => {
    expect(isMutatingTool('addPantryItems')).toBe(true);
    expect(isMutatingTool('listPantry')).toBe(false);
    expect(isMutatingTool('suggestMealsFromPantry')).toBe(false);
  });

  it('summarizes tool args', () => {
    expect(
      argsSummary('addPantryItems', {
        items: [{ name: 'eggs' }, { name: 'milk' }],
      }),
    ).toBe('eggs, milk');
    expect(
      argsSummary('createRecipe', { meal_name: 'Pasta' }),
    ).toBe('Pasta');
    expect(
      argsSummary('addRecipeToMenu', {
        meal_name: 'Soup',
        serving_date: '2026-09-22',
      }),
    ).toBe('Soup on 2026-09-22');
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
      steps: ['燙熟', '加鹽'],
    });
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
