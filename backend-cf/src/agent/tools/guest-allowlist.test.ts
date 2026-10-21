import { describe, expect, it } from 'vitest';
import { GUEST_TOOL_ALLOWLIST, isGuestAllowedTool } from './guest-allowlist';

describe('guest tool allowlist', () => {
  it('allows first-win tools', () => {
    expect(isGuestAllowedTool('addPantryItems')).toBe(true);
    expect(isGuestAllowedTool('createRecipe')).toBe(true);
    expect(isGuestAllowedTool('suggestMealsFromPantry')).toBe(true);
    expect(isGuestAllowedTool('listPantry')).toBe(true);
  });

  it('blocks closed-loop tools', () => {
    expect(isGuestAllowedTool('planMeals')).toBe(false);
    expect(isGuestAllowedTool('confirmMealPlan')).toBe(false);
    expect(isGuestAllowedTool('addShoppingItems')).toBe(false);
    expect(isGuestAllowedTool('adjustPantryItems')).toBe(false);
  });

  it('allowlist matches design set', () => {
    expect([...GUEST_TOOL_ALLOWLIST].sort()).toEqual(
      [
        'addPantryItems',
        'createRecipe',
        'getPreferences',
        'getRecipeDetails',
        'listMyRecipes',
        'listPantry',
        'suggestMealsFromPantry',
      ].sort(),
    );
  });
});
