import { isMutatingTool } from './hitl';

export const TOOL_CARD_TYPES: Record<string, string> = {
  addPantryItems: 'pantry_updated',
  addItemsToShoppingList: 'shopping_list_updated',
  createRecipe: 'recipe_created',
  addRecipeToMenu: 'meal_plan_updated',
  updatePreferences: 'preferences_updated',
  suggestMealsFromPantry: 'meal_suggestions',
};

/** Flat card payload expected by web/mobile `recipe_created` UI. */
export function recipeCreatedCardData(recipe: {
  id: string;
  meal_name: string;
  ingredients: unknown[];
  instructions: string[];
}): Record<string, unknown> {
  return {
    recipeId: recipe.id,
    recipeName: recipe.meal_name,
    ingredientCount: recipe.ingredients.length,
    steps: recipe.instructions,
  };
}

/** Flat card payload expected by web/mobile `meal_plan_updated` UI. */
export function mealPlanUpdatedCardData(plan: {
  id: string;
  meal_name: string;
  meal_type: string;
  serving_date: string;
}): Record<string, unknown> {
  return {
    mealPlanId: plan.id,
    recipeName: plan.meal_name,
    mealType: plan.meal_type,
    servingDate: plan.serving_date,
  };
}

export type ToolCardEvent = {
  toolName: string;
  cardType: string;
  data: Record<string, unknown>;
};

/** Prefer last mutating card; multi_action if ≥2 distinct mutating types; else text. */
export function aggregateCard(
  events: ToolCardEvent[],
): { type: string; data: Record<string, unknown> } {
  const mutating = events.filter((e) => isMutatingTool(e.toolName));
  if (mutating.length === 0) {
    const last = events[events.length - 1];
    if (last?.cardType && last.cardType !== 'text') {
      return { type: last.cardType, data: last.data };
    }
    return { type: 'text', data: {} };
  }

  const distinct = new Set(mutating.map((e) => e.cardType));
  if (distinct.size >= 2) {
    return {
      type: 'multi_action',
      data: {
        actions: mutating.map((e) => ({
          type: e.cardType,
          data: e.data,
        })),
      },
    };
  }

  const last = mutating[mutating.length - 1]!;
  return { type: last.cardType, data: last.data };
}
