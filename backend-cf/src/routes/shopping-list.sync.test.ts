import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { signJwt } from '../lib/jwt';
import { shoppingListRoutes } from './shopping-list';
import type { Env } from '../env';
import type { ShoppingListItemRow } from '../db/shopping-list';

const JWT_SECRET = 'x'.repeat(32);
const USER = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type IdemRow = {
  method: string;
  route_key: string;
  status: number;
  response_json: string;
  created_at: number;
};

function createDb() {
  const shopping = new Map<string, ShoppingListItemRow>();
  const idem = new Map<string, IdemRow>();

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (sql.includes('FROM users')) {
            return {
              id: String(bound[0]),
              role: 'user',
              is_guest: 0,
              email: 'a@example.com',
              first_name: 'A',
              last_name: 'B',
              name: 'A B',
              hashed_password: null,
              salt: null,
              expires_at: null,
            } as T;
          }
          if (sql.includes('FROM idempotency_records')) {
            const key = `${bound[0]}:${bound[1]}`;
            return (idem.get(key) ?? null) as T;
          }
          if (sql.includes('FROM shopping_list_items') && sql.includes('id = ?')) {
            const row = shopping.get(String(bound[0]));
            if (!row || row.user_id !== bound[1]) return null;
            return row as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM shopping_list_items')) {
            const userId = String(bound[0]);
            return {
              results: [...shopping.values()].filter((row) => row.user_id === userId) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('DELETE FROM idempotency_records') && sql.includes('created_at')) {
            return { meta: { changes: 0 } };
          }
          if (sql.includes('INSERT OR IGNORE INTO idempotency_records')) {
            const key = `${bound[0]}:${bound[1]}`;
            if (idem.has(key)) return { meta: { changes: 0 } };
            idem.set(key, {
              method: String(bound[2]),
              route_key: String(bound[3]),
              status: 0,
              response_json: '',
              created_at: Number(bound[4]),
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE idempotency_records')) {
            const key = `${bound[2]}:${bound[3]}`;
            const row = idem.get(key);
            if (!row) return { meta: { changes: 0 } };
            row.status = Number(bound[0]);
            row.response_json = String(bound[1]);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO shopping_list_items')) {
            const [
              id,
              userId,
              name,
              quantity,
              unit,
              checked,
              ingredientId,
              hasBeenAdded,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string,
              number,
              string | null,
              number,
              number,
              number,
            ];
            shopping.set(id, {
              id,
              user_id: userId,
              name,
              quantity,
              unit,
              checked,
              ingredient_id: ingredientId,
              has_been_added_to_pantry: hasBeenAdded,
              created_at: createdAt,
              updated_at: updatedAt,
              version: 1,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE shopping_list_items') && sql.includes('SET name')) {
            const id = String(bound[7]);
            const userId = String(bound[8]);
            const row = shopping.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            const current = row.version ?? 1;
            const expected = Number(bound[9]);
            if (expected !== current) return { meta: { changes: 0 } };
            shopping.set(id, {
              ...row,
              name: String(bound[0]),
              quantity: String(bound[1]),
              unit: String(bound[2]),
              checked: Number(bound[3]),
              updated_at: Number(bound[6]),
              version: current + 1,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('DELETE FROM shopping_list_items')) {
            const id = String(bound[0]);
            const userId = String(bound[1]);
            const row = shopping.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            if (sql.includes('COALESCE(version, 1) = ?')) {
              const expected = Number(bound[2]);
              if ((row.version ?? 1) !== expected) return { meta: { changes: 0 } };
            }
            shopping.delete(id);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, shopping };
}

async function authHeader(): Promise<Record<string, string>> {
  const token = await signJwt(USER, JWT_SECRET, 3600);
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

describe('shopping list sync contract', () => {
  it('replays an idempotent create instead of inserting again', async () => {
    const { db, shopping } = createDb();
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', shoppingListRoutes);
    const env = {
      DB: db,
      JWT_SECRET,
      CORS_ALLOWED_ORIGINS: '*',
    } as Env;
    const headers = {
      ...(await authHeader()),
      'Idempotency-Key': 'create-milk-1',
    };

    const first = await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Milk', quantity: 1, unit: 'L' }),
      },
      env,
    );
    expect(first.status).toBe(201);
    const created = (await first.json()) as {
      data: { id: string; name: string; version: number };
    };
    expect(created.data.name).toBe('Milk');
    expect(created.data.version).toBe(1);

    const replay = await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Eggs', quantity: 2, unit: 'pcs' }),
      },
      env,
    );
    expect(replay.status).toBe(201);
    expect(replay.headers.get('Idempotency-Replayed')).toBe('true');
    const replayed = (await replay.json()) as { data: { id: string; name: string } };
    expect(replayed.data.id).toBe(created.data.id);
    expect(replayed.data.name).toBe('Milk');
    expect(shopping.size).toBe(1);
  });

  it('returns 409 with the current row when the version does not match', async () => {
    const { db, shopping } = createDb();
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', shoppingListRoutes);
    const env = {
      DB: db,
      JWT_SECRET,
      CORS_ALLOWED_ORIGINS: '*',
    } as Env;
    const headers = await authHeader();

    const create = await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Milk', quantity: 1, unit: 'L' }),
      },
      env,
    );
    const created = (await create.json()) as { data: { id: string; name: string; version: number } };
    const id = created.data.id;

    const conflict = await app.request(
      `/api/shopping-list/${id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ name: 'Oat milk', version: created.data.version + 5 }),
      },
      env,
    );
    expect(conflict.status).toBe(409);
    const body = (await conflict.json()) as {
      code: string;
      data: { current: { id: string; name: string; version: number } };
    };
    expect(body.code).toBe('version_conflict');
    expect(body.data.current.id).toBe(id);
    expect(body.data.current.name).toBe('Milk');
    expect(body.data.current.version).toBe(created.data.version);
    expect(shopping.get(id)?.name).toBe('Milk');

    const deleted = await app.request(
      `/api/shopping-list/${id}?version=99`,
      { method: 'DELETE', headers },
      env,
    );
    expect(deleted.status).toBe(409);
    expect(shopping.has(id)).toBe(true);
  });
});
