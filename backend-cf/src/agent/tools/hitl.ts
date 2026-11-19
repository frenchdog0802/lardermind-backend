import type { ParsedToolCall } from '../../lib/llm-chat';

export const MUTATING_TOOLS = new Set([
  'addPantryItems',
  'updatePantryItems',
  'removePantryItems',
  'addItemsToShoppingList',
  'addMealPlanShortagesToShoppingList',
  'createRecipe',
  'updateRecipe',
  'addRecipeToMenu',
  'planMeals',
  'updatePreferences',
]);

export function isMutatingTool(name: string): boolean {
  return MUTATING_TOOLS.has(name);
}

function itemNameLabel(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const obj = item as Record<string, unknown>;
  if (typeof obj.name === 'string' && obj.name.trim()) return obj.name.trim();
  if (typeof obj.pantry_item_id === 'string' && obj.pantry_item_id.trim()) {
    return obj.pantry_item_id.trim();
  }
  return '';
}

/** "Salt 18 g" when a quantity is known, otherwise just the name. */
function itemQtyLabel(item: unknown): string {
  const name = itemNameLabel(item);
  if (!name || !item || typeof item !== 'object') return name;
  const obj = item as Record<string, unknown>;
  if (typeof obj.quantity !== 'number' || !Number.isFinite(obj.quantity)) return name;
  const qty = Math.round(obj.quantity * 10) / 10;
  const unit = typeof obj.unit === 'string' ? obj.unit.trim() : '';
  return `${name} ${qty}${unit ? ` ${unit}` : ''}`;
}

function updateItemSummary(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const obj = item as Record<string, unknown>;
  const label = itemNameLabel(item) || '?';
  const mode =
    obj.mode === 'delta' ||
    (obj.mode !== 'set' && typeof obj.delta === 'number')
      ? 'delta'
      : 'set';
  if (mode === 'delta' && typeof obj.delta === 'number') {
    const sign = obj.delta > 0 ? '+' : '';
    const unit = typeof obj.unit === 'string' ? obj.unit.trim() : '';
    return `${label} ${sign}${obj.delta}${unit ? ` ${unit}` : ''}`;
  }
  if (typeof obj.quantity === 'number') {
    const unit = typeof obj.unit === 'string' ? obj.unit.trim() : '';
    return `${label} → ${obj.quantity}${unit ? ` ${unit}` : ''}`;
  }
  return label;
}

export function argsSummary(
  name: string,
  args: Record<string, unknown>,
): string {
  switch (name) {
    case 'addPantryItems':
    case 'addItemsToShoppingList': {
      const items = Array.isArray(args.items) ? args.items : [];
      const names = items.map(itemQtyLabel).filter(Boolean);
      return names.length ? names.join(', ') : `${items.length} item(s)`;
    }
    case 'addMealPlanShortagesToShoppingList':
      return `missing ingredients, ${String(args.from ?? '?')} – ${String(args.to ?? '?')}`;
    case 'updatePantryItems': {
      const items = Array.isArray(args.items) ? args.items : [];
      const parts = items.map(updateItemSummary).filter(Boolean);
      return parts.length ? parts.join(', ') : `${items.length} update(s)`;
    }
    case 'removePantryItems': {
      const items = Array.isArray(args.items) ? args.items : [];
      const names = items.map(itemNameLabel).filter(Boolean);
      return names.length
        ? `刪除 ${names.join(', ')}`
        : `刪除 ${items.length} item(s)`;
    }
    case 'createRecipe':
      return String(args.meal_name ?? 'recipe');
    case 'updateRecipe':
      return `update ${String(args.meal_name ?? args.recipe_id ?? 'recipe')}`;
    case 'addRecipeToMenu':
      return `${String(args.meal_name ?? args.recipe_id ?? 'meal')} on ${String(args.serving_date ?? '?')}`;
    case 'planMeals': {
      const meals = Array.isArray(args.meals) ? args.meals : [];
      const dates = meals
        .map((m) =>
          m && typeof m === 'object' && 'serving_date' in m
            ? String((m as { serving_date: unknown }).serving_date)
            : '',
        )
        .filter(Boolean)
        .sort();
      const span =
        dates.length > 0
          ? `${dates[0]}${dates.length > 1 ? `…${dates[dates.length - 1]}` : ''}`
          : '?';
      return `${meals.length} meals (${span})`;
    }
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
