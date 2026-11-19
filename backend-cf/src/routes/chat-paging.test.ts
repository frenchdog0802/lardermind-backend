import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { chatRoutes } from './chat';
import { signJwt } from '../lib/jwt';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import type { Env } from '../env';

const SECRET = 'k'.repeat(40);
const USER = 'user-1';

function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email) VALUES ('${USER}', 'A', 'B', 'A B', 'a@x.com')`,
  );
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email) VALUES ('other', 'C', 'D', 'C D', 'c@x.com')`,
  );
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', chatRoutes);
  const env = { DB: h.db, JWT_SECRET: SECRET } as unknown as Env;
  const get = async (path: string) =>
    app.request(
      path,
      { headers: { Authorization: `Bearer ${await signJwt(USER, SECRET, 3600)}` } },
      env,
    );
  return { ...h, get };
}

describe('chat history / sessions optional paging (real SQLite)', () => {
  it('history without limit returns the whole session, unchanged shape', async () => {
    const { sqlite, get } = setup();
    sqlite.exec(
      `INSERT INTO chat_sessions (id, user_id, title, is_default, created_at, updated_at) VALUES ('s1', '${USER}', 't', 0, 1, 1)`,
    );
    for (let i = 1; i <= 5; i++) {
      sqlite.exec(
        `INSERT INTO ai_messages (id, user_id, session_id, role, content, created_at) VALUES ('m${i}', '${USER}', 's1', 'user', 'msg ${i}', ${100 + i})`,
      );
    }
    const res = await get('/api/chat/history?sessionId=s1');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: Record<string, unknown> & { messages: Array<{ id: string }> } };
    expect(body.data.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(body.data).not.toHaveProperty('hasMore');
    expect(body.data).not.toHaveProperty('nextBefore');
  });

  it('pages newest-first with a before cursor, ties broken by insertion order', async () => {
    const { sqlite, get } = setup();
    sqlite.exec(
      `INSERT INTO chat_sessions (id, user_id, title, is_default, created_at, updated_at) VALUES ('s1', '${USER}', 't', 0, 1, 1)`,
    );
    // m3 and m4 share a timestamp.
    const ts = [101, 102, 103, 103, 105];
    ts.forEach((t, i) =>
      sqlite.exec(
        `INSERT INTO ai_messages (id, user_id, session_id, role, content, created_at) VALUES ('m${i + 1}', '${USER}', 's1', 'user', 'msg', ${t})`,
      ),
    );
    type Page = { data: { messages: Array<{ id: string }>; hasMore: boolean; nextBefore: string | null } };
    const p1 = (await (await get('/api/chat/history?sessionId=s1&limit=2')).json()) as Page;
    expect(p1.data.messages.map((m) => m.id)).toEqual(['m4', 'm5']);
    expect(p1.data.hasMore).toBe(true);
    expect(p1.data.nextBefore).toBe('m4');

    const p2 = (await (await get('/api/chat/history?sessionId=s1&limit=2&before=m4')).json()) as Page;
    expect(p2.data.messages.map((m) => m.id)).toEqual(['m2', 'm3']);
    expect(p2.data.nextBefore).toBe('m2');

    const p3 = (await (await get('/api/chat/history?sessionId=s1&limit=2&before=m2')).json()) as Page;
    expect(p3.data.messages.map((m) => m.id)).toEqual(['m1']);
    expect(p3.data.hasMore).toBe(false);
    expect(p3.data.nextBefore).toBeNull();

    expect((await get('/api/chat/history?sessionId=s1&limit=0')).status).toBe(400);
    expect((await get('/api/chat/history?sessionId=nope')).status).toBe(404);
  });

  it('reuses the session row for pendingInterrupt (no second session read) and reads in parallel', async () => {
    const { sqlite, get, log } = setup();
    const pending = JSON.stringify({
      createdAt: 1,
      pendingTools: [{ name: 'planMeals', argsSummary: 'x' }],
      toolCalls: [{ id: 'c1', name: 'planMeals', arguments: {} }],
      messages: [],
    });
    sqlite
      .prepare(
        `INSERT INTO chat_sessions (id, user_id, title, is_default, created_at, updated_at, pending_interrupt_json) VALUES ('s1', ?, 't', 0, 1, 1, ?)`,
      )
      .run(USER, pending);
    log.length = 0;
    const res = await get('/api/chat/history?sessionId=s1');
    const body = (await res.json()) as { data: { pendingInterrupt?: { pendingTools: unknown[] } } };
    expect(body.data.pendingInterrupt?.pendingTools).toHaveLength(1);
    expect(log.filter((q) => q.includes('FROM chat_sessions'))).toHaveLength(1);
    expect(log.filter((q) => q.includes('FROM ai_messages'))).toHaveLength(1);
  });

  it('sessions: unpaged returns all; limit/before pages by updated_at desc', async () => {
    const { sqlite, get } = setup();
    for (let i = 1; i <= 5; i++) {
      sqlite.exec(
        `INSERT INTO chat_sessions (id, user_id, title, is_default, created_at, updated_at) VALUES ('s${i}', '${USER}', 't${i}', 0, ${i}, ${i})`,
      );
    }
    sqlite.exec(
      `INSERT INTO chat_sessions (id, user_id, title, is_default, created_at, updated_at) VALUES ('x1', 'other', 'nope', 0, 9, 9)`,
    );
    const all = (await (await get('/api/chat/sessions')).json()) as {
      data: { sessions: Array<{ id: string }> };
    };
    expect(all.data.sessions.map((s) => s.id)).toEqual(['s5', 's4', 's3', 's2', 's1']);
    expect(all.data).not.toHaveProperty('hasMore');

    type Page = { data: { sessions: Array<{ id: string }>; hasMore: boolean; nextBefore: string | null } };
    const p1 = (await (await get('/api/chat/sessions?limit=2')).json()) as Page;
    expect(p1.data.sessions.map((s) => s.id)).toEqual(['s5', 's4']);
    expect(p1.data.hasMore).toBe(true);
    const p2 = (await (await get(`/api/chat/sessions?limit=2&before=${p1.data.sessions[1]!.id}`)).json()) as Page;
    expect(p2.data.sessions.map((s) => s.id)).toEqual(['s3', 's2']);
    const p3 = (await (await get('/api/chat/sessions?limit=2&before=s2')).json()) as Page;
    expect(p3.data.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(p3.data.hasMore).toBe(false);
  });
});
