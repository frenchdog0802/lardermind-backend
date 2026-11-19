import { afterEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import type { Env } from '../env';
import { authRoutes } from './auth';
import { passwordResetRoutes } from './password-reset';
import { signJwt } from '../lib/jwt';
import { hashPassword } from '../lib/password';
import { findUserByEmail, findUserByGoogleId, softDeleteUser } from '../db/users';

const SECRET = 's'.repeat(40);

type User = {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  hashed_password: string | null;
  salt: string | null;
  role: string;
  google_id: string | null;
  picture: string | null;
  created_at: number | null;
  updated_at: number | null;
  is_guest: number;
  expires_at: number | null;
  deleted_at: number | null;
  deleted_email: string | null;
  deleted_google_id: string | null;
};
type TokenRow = { user_id: string; token_hash: string; used_at: number | null; expires_at: number };

function fakeDb(users: User[]) {
  const tokens: TokenRow[] = [];
  const rate = new Map<string, number>();

  const find = (pred: (u: User) => boolean, sql: string) =>
    users.find((u) => pred(u) && (!sql.includes('deleted_at IS NULL') || u.deleted_at == null)) ??
    null;

  const exec = (sql: string, b: unknown[]) => {
    if (sql.includes('INSERT INTO auth_rate_limits')) {
      const key = `${b[1]}|${b[2]}`;
      rate.set(key, (rate.get(key) ?? 0) + 1);
      return { changes: 1, row: null };
    }
    if (sql.includes('SELECT attempts FROM auth_rate_limits')) {
      return { changes: 0, row: { attempts: rate.get(`${b[0]}|${b[1]}`) ?? 0 } };
    }
    if (sql.includes('SELECT * FROM users WHERE email = ?')) {
      return { changes: 0, row: find((u) => u.email === b[0], sql) };
    }
    if (sql.includes('SELECT * FROM users WHERE id = ?')) {
      return { changes: 0, row: find((u) => u.id === b[0], sql) };
    }
    if (sql.includes('SELECT * FROM users WHERE google_id = ?')) {
      return { changes: 0, row: find((u) => u.google_id === b[0], sql) };
    }
    if (sql.includes('INSERT INTO users')) {
      // Only the password signup insert shape is used here.
      users.push({
        id: String(b[0]),
        first_name: String(b[1]),
        last_name: String(b[2]),
        name: String(b[3]),
        email: String(b[4]),
        hashed_password: String(b[5]),
        salt: null,
        role: 'user',
        google_id: null,
        picture: null,
        created_at: 1,
        updated_at: 1,
        is_guest: 0,
        expires_at: null,
        deleted_at: null,
        deleted_email: null,
        deleted_google_id: null,
      });
      return { changes: 1, row: null };
    }
    if (sql.includes('INSERT INTO usage_quotas')) return { changes: 1, row: null };
    if (sql.includes('UPDATE users SET deleted_at')) {
      const [now, placeholder, , id] = b as [number, string, number, string];
      const u = users.find((x) => x.id === id && x.deleted_at == null);
      if (!u) return { changes: 0, row: null };
      if (users.some((x) => x !== u && x.email === placeholder)) throw new Error('UNIQUE');
      u.deleted_at = now;
      u.deleted_email = u.email;
      u.deleted_google_id = u.google_id;
      u.email = placeholder;
      u.google_id = null;
      u.hashed_password = null;
      u.salt = null;
      return { changes: 1, row: null };
    }
    if (sql.includes('INSERT INTO password_reset_tokens')) {
      tokens.push({
        user_id: String(b[1]),
        token_hash: String(b[2]),
        expires_at: Number(b[3]),
        used_at: null,
      });
      return { changes: 1, row: null };
    }
    if (sql.includes('UPDATE password_reset_tokens') && sql.includes('RETURNING user_id')) {
      const [now, hash] = b as [number, string, number];
      const t = tokens.find((x) => x.token_hash === hash && x.used_at === null && x.expires_at > now);
      if (!t) return { changes: 0, row: null };
      t.used_at = now;
      return { changes: 1, row: { user_id: t.user_id } };
    }
    if (sql.includes('UPDATE password_reset_tokens') && sql.includes('WHERE user_id = ?')) {
      const [now, userId] = b as [number, string];
      let changes = 0;
      for (const t of tokens) {
        if (t.user_id === userId && t.used_at === null) {
          t.used_at = now;
          changes += 1;
        }
      }
      return { changes, row: null };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  };

  const prepare = (sql: string) => {
    let bound: unknown[] = [];
    const stmt = {
      bind(...args: unknown[]) {
        bound = args;
        return stmt;
      },
      async first<T>() {
        return exec(sql, bound).row as T;
      },
      async run() {
        return { meta: { changes: exec(sql, bound).changes } };
      },
      __exec: () => exec(sql, bound),
    };
    return stmt;
  };
  const db = {
    prepare,
    async batch(stmts: Array<{ __exec: () => { changes: number } }>) {
      return stmts.map((s) => ({ meta: { changes: s.__exec().changes } }));
    },
  };
  return { db: db as unknown as D1Database, users, tokens };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    first_name: 'Cook',
    last_name: 'Person',
    name: 'Cook Person',
    email: 'cook@example.com',
    hashed_password: null,
    salt: null,
    role: 'user',
    google_id: 'google-sub-1',
    picture: null,
    created_at: 1,
    updated_at: 1,
    is_guest: 0,
    expires_at: null,
    deleted_at: null,
    deleted_email: null,
    deleted_google_id: null,
    ...overrides,
  };
}

const app = new Hono<{ Bindings: Env }>();
app.route('/', authRoutes);
app.route('/', passwordResetRoutes);

function envFor(db: D1Database): Env {
  return {
    DB: db,
    JWT_SECRET: SECRET,
    GOOGLE_CLIENT_ID: 'client',
    FRONTEND_URL: 'https://lardermind.com',
    RESEND_API_KEY: 're_test',
    MAIL_FROM: 'LarderMind <no-reply@lardermind.com>',
  } as Env;
}

async function bearer(userId: string, guest = false) {
  return { Authorization: `Bearer ${await signJwt(userId, SECRET, 3600, { guest })}` };
}

function call(path: string, env: Env, init: RequestInit = {}) {
  return app.request(
    path,
    {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'cf-connecting-ip': '9.9.9.9',
        ...((init.headers as Record<string, string>) ?? {}),
      },
    },
    env,
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('DELETE /api/auth/account', () => {
  it('requires authentication', async () => {
    const { db } = fakeDb([user()]);
    const res = await call('/api/auth/account', envFor(db), { method: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('soft deletes with the standard envelope and frees email + google id', async () => {
    const { db, users } = fakeDb([user()]);
    const res = await call('/api/auth/account', envFor(db), {
      method: 'DELETE',
      headers: await bearer('u1'),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, message: 'Account deleted', data: null });
    const u = users[0]!;
    expect(u.deleted_at).toBeTypeOf('number');
    expect(u.deleted_email).toBe('cook@example.com');
    expect(u.deleted_google_id).toBe('google-sub-1');
    expect(u.email).not.toBe('cook@example.com');
    expect(u.google_id).toBeNull();
    expect(u.hashed_password).toBeNull();
    expect(users).toHaveLength(1); // row kept, not hard-deleted
  });

  it('works for guest accounts', async () => {
    const { db, users } = fakeDb([
      user({ id: 'g1', email: 'guest-g1@guest.lardermind.local', google_id: null, is_guest: 1, role: 'guest' }),
    ]);
    const res = await call('/api/auth/account', envFor(db), {
      method: 'DELETE',
      headers: await bearer('g1', true),
    });
    expect(res.status).toBe(200);
    expect(users[0]!.deleted_at).not.toBeNull();
  });

  it('rejects the old token afterwards (also a second delete) with 401', async () => {
    const { db } = fakeDb([user()]);
    const env = envFor(db);
    const headers = await bearer('u1');
    expect((await call('/api/auth/account', env, { method: 'DELETE', headers })).status).toBe(200);
    const second = await call('/api/auth/account', env, { method: 'DELETE', headers });
    expect(second.status).toBe(401);
    const claim = await call('/api/auth/claim-guest', env, {
      method: 'POST',
      headers,
      body: JSON.stringify({ guest_token: 'x' }),
    });
    expect(claim.status).toBe(401);
  });

  it('only affects the caller', async () => {
    const { db, users } = fakeDb([user(), user({ id: 'u2', email: 'b@example.com', google_id: null })]);
    await call('/api/auth/account', envFor(db), { method: 'DELETE', headers: await bearer('u1') });
    expect(users[1]!.deleted_at).toBeNull();
    expect(users[1]!.email).toBe('b@example.com');
  });

  it('password signin treats the deleted account as nonexistent', async () => {
    const hashed = await hashPassword('correct-horse');
    const { db } = fakeDb([user({ hashed_password: hashed, google_id: null })]);
    const env = envFor(db);
    const before = await call('/api/auth/signin', env, {
      method: 'POST',
      body: JSON.stringify({ email: 'cook@example.com', password: 'correct-horse' }),
    });
    expect(before.status).toBe(200);
    await call('/api/auth/account', env, { method: 'DELETE', headers: await bearer('u1') });
    const after = await call('/api/auth/signin', env, {
      method: 'POST',
      body: JSON.stringify({ email: 'cook@example.com', password: 'correct-horse' }),
    });
    expect(after.status).toBe(400);
  });

  it('allows signing up again with the same email and a fresh id', async () => {
    const { db, users } = fakeDb([user({ google_id: null })]);
    const env = envFor(db);
    await call('/api/auth/account', env, { method: 'DELETE', headers: await bearer('u1') });
    const res = await call('/api/auth/signup', env, {
      method: 'POST',
      body: JSON.stringify({
        first_name: 'New',
        last_name: 'Me',
        email: 'cook@example.com',
        password: 'brand-new-pass',
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.user.email).toBe('cook@example.com');
    expect(body.data.user.id).not.toBe('u1');
    expect(users).toHaveLength(2);
  });

  it('google id / email lookups no longer see the deleted account', async () => {
    const { db, users } = fakeDb([user()]);
    const env = envFor(db);
    await call('/api/auth/account', env, { method: 'DELETE', headers: await bearer('u1') });
    // upsertGoogleUser relies on these two lookups, so it falls through to creating a new user.
    expect(await findUserByGoogleId(db, 'google-sub-1')).toBeNull();
    expect(await findUserByEmail(db, 'cook@example.com')).toBeNull();
    expect(users[0]!.deleted_at).not.toBeNull();
  });

  it('password reset ignores deleted users and deletion burns outstanding tokens', async () => {
    const calls: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        calls.push(JSON.parse(String(init.body)));
        return new Response('{}', { status: 200 });
      }),
    );
    const { db, tokens } = fakeDb([user({ google_id: null, hashed_password: 'old' })]);
    const env = envFor(db);
    await call('/api/auth/password-reset/request', env, {
      method: 'POST',
      body: JSON.stringify({ email: 'cook@example.com' }),
    });
    expect(calls).toHaveLength(1);
    const token = /token=([0-9a-f]{64})/.exec(String(calls[0]!.text))![1]!;
    expect(tokens.filter((t) => t.used_at === null)).toHaveLength(1);

    await call('/api/auth/account', env, { method: 'DELETE', headers: await bearer('u1') });
    expect(tokens.every((t) => t.used_at !== null)).toBe(true);

    const confirm = await call('/api/auth/password-reset/confirm', env, {
      method: 'POST',
      body: JSON.stringify({ token, password: 'another-pass-1' }),
    });
    expect(confirm.status).toBe(400);

    await call('/api/auth/password-reset/request', env, {
      method: 'POST',
      body: JSON.stringify({ email: 'cook@example.com' }),
    });
    expect(calls).toHaveLength(1); // no new mail for a deleted account
  });

  it('softDeleteUser is a no-op for unknown or already deleted users', async () => {
    const { db } = fakeDb([user()]);
    expect(await softDeleteUser(db, 'nope')).toBe(false);
    expect(await softDeleteUser(db, 'u1')).toBe(true);
    expect(await softDeleteUser(db, 'u1')).toBe(false);
  });
});
