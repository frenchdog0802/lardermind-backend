import { describe, expect, it } from 'vitest';
import type { PantryItemRow } from '../../db/pantry';
import { executeTool } from './execute';
import { listToolNames } from './definitions';
import { isMutatingTool, argsSummary } from './hitl';

function createMockDb(seed: PantryItemRow[] = []) {
  const items = new Map<string, PantryItemRow>();
  for (const row of seed) items.set(row.id, { ...row });

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          const all = [...items.values()];
          if (sql.includes('LOWER(name)')) {
            const userId = bound[0] as string;
            const name = String(bound[1]).toLowerCase();
            return (
              (all.find(
                (r) =>
                  r.user_id === userId && r.name.toLowerCase() === name,
              ) as T) ?? null
            );
          }
          if (sql.includes('id = ? AND user_id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = items.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('WHERE user_id = ?')) {
            const userId = bound[0] as string;
            return {
              results: [...items.values()].filter(
                (r) => r.user_id === userId,
              ) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('UPDATE pantry_items')) {
            const [name, quantity, unit, notes, ingredientId, updatedAt, id, userId] =
              bound as [
                string,
                string,
                string,
                string | null,
                string | null,
                number,
                string,
                string,
              ];
            const existing = items.get(id);
            if (!existing || existing.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            items.set(id, {
              ...existing,
              name,
              quantity,
              unit,
              notes,
              ingredient_id: ingredientId,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('DELETE FROM pantry_items')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const existing = items.get(id);
            if (!existing || existing.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            items.delete(id);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, items };
}

const rib: PantryItemRow = {
  id: 'p-rib',
  user_id: 'u1',
  name: '排骨',
  quantity: '10',
  unit: '包',
  notes: null,
  ingredient_id: null,
  created_at: 1,
  updated_at: 1,
};

const egg: PantryItemRow = {
  id: 'p-egg',
  user_id: 'u1',
  name: 'eggs',
  quantity: '6',
  unit: 'pcs',
  notes: null,
  ingredient_id: null,
  created_at: 1,
  updated_at: 1,
};

describe('pantry mutate tools registration', () => {
  it('lists update and remove tools as mutating', () => {
    const names = listToolNames();
    expect(names).toContain('updatePantryItems');
    expect(names).toContain('removePantryItems');
    expect(isMutatingTool('updatePantryItems')).toBe(true);
    expect(isMutatingTool('removePantryItems')).toBe(true);
  });

  it('summarizes update and remove args', () => {
    expect(
      argsSummary('updatePantryItems', {
        items: [{ name: '排骨', delta: -3 }],
      }),
    ).toBe('排骨 -3');
    expect(
      argsSummary('removePantryItems', {
        items: [{ name: '排骨' }],
      }),
    ).toBe('刪除 排骨');
  });
});

describe('executeTool updatePantryItems / removePantryItems', () => {
  it('applies delta reduce', async () => {
    const { db, items } = createMockDb([rib]);
    const result = await executeTool(db, 'u1', 'updatePantryItems', {
      items: [{ name: '排骨', delta: -3 }],
    });
    expect(result.cardType).toBe('pantry_updated');
    const body = JSON.parse(result.content) as {
      items: Array<{ quantity: number }>;
      errors: unknown[];
    };
    expect(body.errors).toEqual([]);
    expect(body.items[0]?.quantity).toBe(7);
    expect(items.get('p-rib')?.quantity).toBe('7');
  });

  it('sets absolute quantity', async () => {
    const { db, items } = createMockDb([rib]);
    await executeTool(db, 'u1', 'updatePantryItems', {
      items: [{ name: '排骨', quantity: 2, mode: 'set' }],
    });
    expect(items.get('p-rib')?.quantity).toBe('2');
  });

  it('deletes when new quantity <= 0', async () => {
    const { db, items } = createMockDb([rib]);
    const result = await executeTool(db, 'u1', 'updatePantryItems', {
      items: [{ name: '排骨', delta: -10 }],
    });
    const body = JSON.parse(result.content) as {
      items: Array<{ deleted: boolean }>;
    };
    expect(body.items[0]?.deleted).toBe(true);
    expect(items.has('p-rib')).toBe(false);
  });

  it('removes by name and continues after missing', async () => {
    const { db, items } = createMockDb([rib, egg]);
    const result = await executeTool(db, 'u1', 'removePantryItems', {
      items: [{ name: 'missing' }, { name: '排骨' }],
    });
    const body = JSON.parse(result.content) as {
      items: Array<{ name: string }>;
      errors: Array<{ error: string }>;
    };
    expect(body.errors).toHaveLength(1);
    expect(body.items).toHaveLength(1);
    expect(body.items[0]?.name).toBe('排骨');
    expect(items.has('p-rib')).toBe(false);
    expect(items.has('p-egg')).toBe(true);
  });
});
