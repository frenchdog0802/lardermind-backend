import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { signJwt } from '../lib/jwt';
import { pantryRoutes } from './pantry';
import type { Env } from '../env';
import type { PantryItemRow } from '../db/pantry';

const JWT_SECRET = 'x'.repeat(32);
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function createMockDb() {
  const items = new Map<string, PantryItemRow>();

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
          if (sql.includes('ingredient_id = ?')) {
            const userId = bound[0] as string;
            const ingredientId = bound[1] as string;
            return (
              (all.find(
                (r) =>
                  r.user_id === userId && r.ingredient_id === ingredientId,
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
            const rows = [...items.values()]
              .filter((r) => r.user_id === userId)
              .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));
            return { results: rows as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO pantry_items')) {
            const [
              id,
              userId,
              name,
              quantity,
              unit,
              notes,
              ingredientId,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string,
              string | null,
              string | null,
              number,
              number,
            ];
            items.set(id, {
              id,
              user_id: userId,
              name,
              quantity,
              unit,
              notes,
              ingredient_id: ingredientId,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
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
            const row = items.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            items.set(id, {
              ...row,
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
            const row = items.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            items.delete(id);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, items };
}

async function authHeader(userId: string): Promise<string> {
  const token = await signJwt(userId, JWT_SECRET, 3600);
  return `Bearer ${token}`;
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', pantryRoutes);
  const env = {
    DB: db,
    JWT_SECRET,
    CORS_ALLOWED_ORIGINS: '*',
    AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
    JWT_EXPIRES_IN_SECONDS: '3600',
  } as unknown as Env;
  return { app, env };
}

describe('pantry routes', () => {
  let db: D1Database;
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    ({ app, env } = createApp(db));
  });

  it('rejects unauthenticated list', async () => {
    const res = await app.request('/api/pantry-item', {}, env);
    expect(res.status).toBe(401);
  });

  it('creates with flat+details and lists item', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };
    const create = await app.request(
      '/api/pantry-item',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Egg',
          quantity: 1,
          unit: 'pcs',
          details: { quantity: 1, unit: 'pcs' },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const createdBody = (await create.json()) as {
      success: boolean;
      data: { id: string; name: string; quantity: number; details: { quantity: number } };
    };
    expect(createdBody.success).toBe(true);
    expect(createdBody.data.name).toBe('Egg');
    expect(createdBody.data.quantity).toBe(1);
    expect(createdBody.data.details.quantity).toBe(1);

    const list = await app.request(
      '/api/pantry-item',
      { headers: { Authorization: await authHeader(USER_A) } },
      env,
    );
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      data: Array<{ name: string }>;
    };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('Egg');
  });

  it('creates from web-style details-only quantity/unit', async () => {
    const res = await app.request(
      '/api/pantry-item',
      {
        method: 'POST',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Milk',
          details: { quantity: 2, unit: 'cup' },
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { quantity: number; unit: string; details: { quantity: number; unit: string } };
    };
    expect(body.data.quantity).toBe(2);
    expect(body.data.unit).toBe('cup');
    expect(body.data.details.quantity).toBe(2);
    expect(body.data.details.unit).toBe('cup');
  });

  it('returns 400 for empty name', async () => {
    const res = await app.request(
      '/api/pantry-item',
      {
        method: 'POST',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: '  ', quantity: 1, unit: 'pcs' }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('enforces ownership on get/update/delete', async () => {
    const create = await app.request(
      '/api/pantry-item',
      {
        method: 'POST',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Salt', quantity: 1, unit: 'pcs' }),
      },
      env,
    );
    const { data } = (await create.json()) as { data: { id: string } };

    const getB = await app.request(
      `/api/pantry-item/${data.id}`,
      { headers: { Authorization: await authHeader(USER_B) } },
      env,
    );
    expect(getB.status).toBe(404);

    const putB = await app.request(
      `/api/pantry-item/${data.id}`,
      {
        method: 'PUT',
        headers: {
          Authorization: await authHeader(USER_B),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ quantity: 9 }),
      },
      env,
    );
    expect(putB.status).toBe(404);

    const delB = await app.request(
      `/api/pantry-item/${data.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: await authHeader(USER_B) },
      },
      env,
    );
    expect(delB.status).toBe(404);

    const delA = await app.request(
      `/api/pantry-item/${data.id}`,
      {
        method: 'DELETE',
        headers: { Authorization: await authHeader(USER_A) },
      },
      env,
    );
    expect(delA.status).toBe(200);
  });

  it('POST bulk creates multiple items', async () => {
    const res = await app.request(
      '/api/pantry-item/bulk',
      {
        method: 'POST',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            { name: 'A', quantity: 1, unit: 'pcs' },
            { name: 'B', quantity: 2, unit: 'cup' },
          ],
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: unknown[] };
    expect(body.data).toHaveLength(2);
  });

  it('PUT bulk sets quantity on name match (does not add)', async () => {
    await app.request(
      '/api/pantry-item',
      {
        method: 'POST',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'Onion', quantity: 3, unit: 'pcs' }),
      },
      env,
    );

    const res = await app.request(
      '/api/pantry-item/bulk',
      {
        method: 'PUT',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [{ name: 'onion', quantity: 1, unit: 'pcs' }],
        }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(body.data).toHaveLength(1);
    expect(body.data[0].quantity).toBe(1);

    const list = await app.request(
      '/api/pantry-item',
      { headers: { Authorization: await authHeader(USER_A) } },
      env,
    );
    const listBody = (await list.json()) as {
      data: Array<{ quantity: number }>;
    };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].quantity).toBe(1);
  });

  it('rejects empty bulk items', async () => {
    const res = await app.request(
      '/api/pantry-item/bulk',
      {
        method: 'POST',
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ items: [] }),
      },
      env,
    );
    expect(res.status).toBe(400);
  });
});
