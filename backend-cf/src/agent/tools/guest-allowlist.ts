/** Tools guests may call (first-win paste → createRecipe → suggest). */
export const GUEST_TOOL_ALLOWLIST = new Set([
  'listPantry',
  'listMyRecipes',
  'getRecipeDetails',
  'getPreferences',
  'suggestMealsFromPantry',
  'addPantryItems',
  'createRecipe',
]);

export function isGuestAllowedTool(name: string): boolean {
  return GUEST_TOOL_ALLOWLIST.has(name);
}
