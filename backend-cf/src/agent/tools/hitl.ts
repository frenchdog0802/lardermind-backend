import type { ParsedToolCall } from '../../lib/llm-chat';

export const MUTATING_TOOLS = new Set([
  'addPantryItems',
  'addItemsToShoppingList',
  'createRecipe',
  'addRecipeToMenu',
  'updatePreferences',
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name);
}

export function argsSummary(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case 'addPantryItems':
    case 'addItemsToShoppingList': {
      const items = Array.isArray(args.items) ? args.items : [];
      const names = items
        .map((i) =>
          i && typeof i === 'object' && 'name' in i
            ? String((i as { name: unknown }).name)
            : '',
        )
        .filter(Boolean);
      return names.length ? names.join(', ') : `${items.length} item(s)`;
    }
    case 'createRecipe':
      return String(args.meal_name ?? 'recipe');
    case 'addRecipeToMenu':
      return `${String(args.meal_name ?? args.recipe_id ?? 'meal')} on ${String(args.serving_date ?? '?')}`;
    case 'updatePreferences':
      return 'update preferences';
    default:
      return name;
  }
}

export function toPendingTools(toolCalls: ParsedToolCall[]) {
  return toolCalls.map((tc) => ({
    name: tc.name,
    argsSummary: argsSummary(tc.name, tc.arguments),
    id: tc.id,
  }));
}
