import { beforeEach, describe, expect, it } from 'vitest';
import type { PantryItemRow } from './pantry';
import type { ShoppingListItemRow } from './shopping-list';
import { syncItemsToPantry, unsyncItemsFromPantry } from './shopping-list';

const pantry = new Map<string, PantryItemRow>();
const shopping = new Map<string, ShoppingListItemRow>();
const batchSizes: number[] = [];

function pantryRow(
  id: string,
  name: string,
  quantity: number,
  unit: string,
): PantryItemRow {
  return {
    id,
    user_id: 'u1',
    name,
    quantity: String(quantity),
    unit,
    notes: null,
    ingredient_id: null,
    created_at: 1,
    updated_at: 1,
  };
}

/** Minimal D1 stub covering the pantry + shopping statements the sync paths issue. */
const db = {
  prepare(sql: string) {
    let bound: unknown[] = [];
    return {
      bind(...args: unknown[]) {
        bound = args;
        return this;
      },
      async first<T>() {
        if (sql.includes('FROM shopping_list_items')) {
          return (shopping.get(String(bound[0])) ?? null) as T;
        }
        if (sql.includes('FROM pantry_items')) {
          if (sql.includes('LOWER(name) = LOWER(?)')) {
            const name = String(bound[1]).toLowerCase();
            return ([...pantry.values()].find(
              (r) => r.name.toLowerCase() === name,
            ) ?? null) as T;
          }
          if (sql.includes('ingredient_id = ?')) return null;
          return (pantry.get(String(bound[0])) ?? null) as T;
        }
        return null;
      },
      async all() {
        // Prefetch IN queries issued by the batch sync / unsync paths (bound[0] is the user id).
        const rest = bound.slice(1).map(String);
        if (sql.includes('FROM shopping_list_items') && sql.includes('id IN')) {
          return { results: rest.map((id) => shopping.get(id)).filter(Boolean) };
        }
        if (sql.includes('FROM pantry_items') && sql.includes('NOCASE IN')) {
          const names = new Set(rest.map((n) => n.toLowerCase()));
          return { results: [...pantry.values()].filter((r) => names.has(r.name.toLowerCase())) };
        }
        if (sql.includes('FROM pantry_items') && sql.includes('ingredient_id IN')) {
          return { results: [...pantry.values()].filter((r) => r.ingredient_id && rest.includes(r.ingredient_id)) };
        }
        return { results: [] };
      },
      async run() {
        if (sql.includes('INSERT INTO pantry_items')) {
          const [id, userId, name, quantity, unit] = bound as string[];
          pantry.set(id!, {
            ...pantryRow(id!, name!, Number(quantity), unit!),
            user_id: userId!,
          });
        } else if (sql.includes('UPDATE pantry_items')) {
          const [name, quantity, unit, , , , id] = bound as string[];
          const row = pantry.get(id!);
          if (row) pantry.set(id!, { ...row, name: name!, quantity: quantity!, unit: unit! });
        } else if (sql.includes('DELETE FROM pantry_items')) {
          pantry.delete(String(bound[0]));
        } else if (sql.includes('UPDATE shopping_list_items')) {
          const flagFirst = sql.includes('SET has_been_added_to_pantry = ?');
          const id = String(flagFirst ? bound[2] : bound[3]);
          const row = shopping.get(id);
          if (row) {
            shopping.set(id, {
              ...row,
              has_been_added_to_pantry: flagFirst ? Number(bound[0]) : 1,
              version: (row.version ?? 1) + 1,
            });
          }
        }
        return { meta: { changes: 1 } };
      },
    };
  },
  async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
    batchSizes.push(stmts.length);
    for (const s of stmts) await s.run();
  },
} as unknown as D1Database;

function addShopping(
  id: string,
  name: string,
  quantity: number,
  unit: string,
): void {
  shopping.set(id, {
    id,
    user_id: 'u1',
    name,
    quantity: String(quantity),
    unit,
    checked: 1,
    ingredient_id: null,
    has_been_added_to_pantry: 0,
    created_at: 1,
    updated_at: 1,
    version: 1,
  });
}

beforeEach(() => {
  pantry.clear();
  shopping.clear();
  batchSizes.length = 0;
});

describe('shopping check-off undo leaves no ghost pantry row', () => {
  it('removes the pantry row that the check-off created', async () => {
    addShopping('s1', 'Tomatoes', 3, 'pcs');
    await syncItemsToPantry(db, 'u1', [{ id: 's1' }]);
    expect([...pantry.values()].map((r) => [r.name, r.quantity])).toEqual([
      ['Tomatoes', '3'],
    ]);

    const result = await unsyncItemsFromPantry(db, 'u1', ['s1']);
    expect(result.unsynced).toHaveLength(1);
    expect(pantry.size).toBe(0); // no "Tomatoes - 0 pcs"
  });

  it('restores the previous quantity when the check-off merged into an existing row', async () => {
    pantry.set('p0', pantryRow('p0', 'Tomatoes', 2, 'pcs'));
    addShopping('s1', 'tomatoes', 3, 'pcs');
    await syncItemsToPantry(db, 'u1', [{ id: 's1' }]);
    expect(pantry.get('p0')?.quantity).toBe('5');

    await unsyncItemsFromPantry(db, 'u1', ['s1']);
    expect(pantry.get('p0')?.quantity).toBe('2');
    expect(pantry.size).toBe(1);
  });

  it('converts units when undoing a merge (1 l into a ml row and back)', async () => {
    pantry.set('p0', pantryRow('p0', 'Milk', 500, 'ml'));
    addShopping('s1', 'Milk', 1, 'l');
    await syncItemsToPantry(db, 'u1', [{ id: 's1' }]);
    expect(Number(pantry.get('p0')?.quantity)).toBeCloseTo(1500, 6);

    await unsyncItemsFromPantry(db, 'u1', ['s1']);
    expect(Number(pantry.get('p0')?.quantity)).toBeCloseTo(500, 6);
  });

  it('never leaves a zero-quantity row after undoing everything that was there', async () => {
    addShopping('s1', 'Bananas', 2, 'pcs');
    await syncItemsToPantry(db, 'u1', [{ id: 's1' }]);
    await unsyncItemsFromPantry(db, 'u1', ['s1']);
    expect([...pantry.values()].some((r) => Number(r.quantity) <= 0)).toBe(
      false,
    );
  });

  it('syncs many items with one batch (no per-item round trips)', async () => {
    for (let i = 0; i < 30; i++) addShopping(`s${i}`, `Item ${i}`, 1, 'pcs');
    pantry.set('p0', pantryRow('p0', 'item 3', 2, 'pcs'));
    const ids = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}` }));
    const result = await syncItemsToPantry(db, 'u1', ids);
    expect(result.synced).toHaveLength(30);
    expect(batchSizes).toEqual([60]); // 30 pantry writes + 30 shopping flag updates
    expect(pantry.size).toBe(30); // 29 created + 1 merged into p0
    expect(pantry.get('p0')?.quantity).toBe('3');

    batchSizes.length = 0;
    const undone = await unsyncItemsFromPantry(
      db,
      'u1',
      ids.map((i) => i.id),
    );
    expect(undone.unsynced).toHaveLength(30);
    expect(batchSizes).toEqual([60]);
    expect(pantry.size).toBe(1);
    expect(pantry.get('p0')?.quantity).toBe('2');
  });

  it('a later item in the same batch merges into the row an earlier item created', async () => {
    addShopping('s1', 'Basil', 1, 'pcs');
    addShopping('s2', 'basil', 2, 'pcs');
    await syncItemsToPantry(db, 'u1', [{ id: 's1' }, { id: 's2' }]);
    expect([...pantry.values()].map((r) => [r.name, r.quantity])).toEqual([['Basil', '3']]);
  });
});
