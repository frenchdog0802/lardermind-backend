import { findPantryByNameLoose, getPantryItem } from '../../db/pantry';
import { normalizeToolQuantity, normalizeToolUnit } from '../../db/units';

type ToolCallLike = { name: string; arguments: Record<string, unknown> };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/**
 * Constrain units to the app unit list BEFORE the approval card is built and the
 * pending call is stored, so the card shows (and approval applies) the real unit:
 * invented units (bottle, carton, loaf) are mapped, missing units are defaulted,
 * and a pantry quantity update without a unit inherits the row's current unit.
 */
export async function normalizeToolCallArgs<T extends ToolCallLike>(
  db: D1Database,
  userId: string,
  toolCalls: T[],
): Promise<T[]> {
  const out: T[] = [];
  for (const call of toolCalls) {
    const args = call.arguments ?? {};
    let next: Record<string, unknown> | null = null;

    if (call.name === 'addPantryItems' || call.name === 'addItemsToShoppingList') {
      const items = Array.isArray(args.items) ? args.items : [];
      next = {
        ...args,
        items: items.map((raw) => {
          const item = asRecord(raw);
          if (!item) return raw;
          const name = typeof item.name === 'string' ? item.name : '';
          return {
            ...item,
            ...normalizeToolQuantity(
              name,
              num(item.quantity, 1),
              typeof item.unit === 'string' ? item.unit : '',
            ),
          };
        }),
      };
    } else if (call.name === 'updatePantryItems') {
      const items = Array.isArray(args.items) ? args.items : [];
      const mapped: unknown[] = [];
      for (const raw of items) {
        const item = asRecord(raw);
        if (!item) {
          mapped.push(raw);
          continue;
        }
        const id =
          typeof item.pantry_item_id === 'string' ? item.pantry_item_id.trim() : '';
        const name = typeof item.name === 'string' ? item.name.trim() : '';
        const row = id
          ? await getPantryItem(db, userId, id)
          : name
            ? await findPantryByNameLoose(db, userId, name)
            : null;
        const rawUnit = typeof item.unit === 'string' ? item.unit.trim() : '';
        const label = name || row?.name || '';
        const qty = num(item.quantity, num(item.delta, 1));
        if (rawUnit) {
          const norm = normalizeToolQuantity(label, qty, rawUnit);
          const converted = norm.unit !== rawUnit.toLowerCase() && norm.quantity !== qty;
          const patch: Record<string, unknown> = { unit: norm.unit };
          if (converted) {
            if (typeof item.delta === 'number') patch.delta = norm.quantity;
            else patch.quantity = norm.quantity;
          }
          mapped.push({ ...item, ...patch });
          continue;
        }
        const unit = row?.unit?.trim() || normalizeToolUnit(label, '', qty);
        mapped.push({ ...item, unit });
      }
      next = { ...args, items: mapped };
    } else if (call.name === 'createRecipe' || call.name === 'updateRecipe') {
      if (Array.isArray(args.ingredients)) {
        next = {
          ...args,
          ingredients: args.ingredients.map((raw) => {
            const ing = asRecord(raw);
            if (!ing) return raw;
            return {
              ...ing,
              ...normalizeToolQuantity(
                typeof ing.name === 'string' ? ing.name : '',
                num(ing.quantity, 0),
                typeof ing.unit === 'string' ? ing.unit : '',
                'recipe',
              ),
            };
          }),
        };
      }
    }

    out.push(next ? { ...call, arguments: next } : call);
  }
  return out;
}
