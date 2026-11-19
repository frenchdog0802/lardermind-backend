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

/** Dish names shown on a planMeals approval card before "+N more". */
export const PLAN_SUMMARY_MAX_DISHES = 12;
const PLAN_SUMMARY_NAME_MAX = 40;

type PlanEntry = { date: string; type: string; name: string };

function planEntries(args: Record<string, unknown>): PlanEntry[] {
  const meals = Array.isArray(args.meals) ? args.meals : [];
  return meals.map((m) => {
    const obj = m && typeof m === 'object' ? (m as Record<string, unknown>) : {};
    const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    let name = str(obj.meal_name) || str(obj.recipe_id) || '?';
    if (name.length > PLAN_SUMMARY_NAME_MAX) {
      name = `${name.slice(0, PLAN_SUMMARY_NAME_MAX - 1)}…`;
    }
    return { date: str(obj.serving_date), type: str(obj.meal_type), name };
  });
}

/**
 * "10 meals (2026-11-20…2026-11-24): 2026-11-20 Braised pork, Garlic spinach; …"
 * Lists the proposed date → dish names so the user approves what will
 * actually be written (capped at PLAN_SUMMARY_MAX_DISHES names, then "+N more").
 */
function planMealsSummary(args: Record<string, unknown>): string {
  const entries = planEntries(args);
  const dates = entries.map((e) => e.date).filter(Boolean).sort();
  const span =
    dates.length > 0
      ? `${dates[0]}${dates.length > 1 && dates[dates.length - 1] !== dates[0] ? `…${dates[dates.length - 1]}` : ''}`
      : '?';
  const header = `${entries.length} meals (${span})`;
  if (entries.length === 0) return header;

  const mixedTypes = new Set(entries.map((e) => e.type)).size > 1;
  const ordered = entries
    .map((e, index) => ({ ...e, index }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.index - b.index);
  const shown = ordered.slice(0, PLAN_SUMMARY_MAX_DISHES);
  const byDate = new Map<string, Map<string, string[]>>();
  for (const e of shown) {
    const day = byDate.get(e.date) ?? new Map<string, string[]>();
    byDate.set(e.date, day);
    const key = mixedTypes ? e.type : '';
    day.set(key, [...(day.get(key) ?? []), e.name]);
  }
  const parts = [...byDate.entries()].map(([date, types]) => {
    const slots = [...types.entries()].map(([type, names]) =>
      type ? `${type}: ${names.join(', ')}` : names.join(', '),
    );
    return `${date || '?'} ${slots.join(' / ')}`;
  });
  const rest = entries.length - shown.length;
  return `${header}: ${parts.join('; ')}${rest > 0 ? ` +${rest} more` : ''}`;
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
    case 'planMeals':
      return planMealsSummary(args);
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
