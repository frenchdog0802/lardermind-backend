import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../env';
import {
  buildPasswordResetEmail,
  PASSWORD_RESET_REQUEST_MESSAGE,
  passwordResetRoutes,
} from './password-reset';
import { hashResetToken } from '../db/password-reset';
import { verifyPassword } from '../lib/password';
import { sendMail } from '../lib/mailer';

type User = {
  id: string;
  email: string;
  hashed_password: string | null;
  salt: string | null;
  role: string;
  google_id: string | null;
  is_guest: number;
  first_name: string;
  last_name: string;
  name: string;
};

type TokenRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: number;
  used_at: number | null;
  created_at: number;
};

function fakeDb(users: User[]) {
  const tokens: TokenRow[] = [];
  const rate = new Map<string, number>();

  const exec = (sql: string, bound: unknown[]) => {
    if (sql.includes('INSERT INTO auth_rate_limits')) {
      const key = `${bound[1]}|${bound[2]}`;
      rate.set(key, (rate.get(key) ?? 0) + 1);
      return { changes: 1, row: null };
    }
    if (sql.includes('SELECT attempts FROM auth_rate_limits')) {
      return { changes: 0, row: { attempts: rate.get(`${bound[0]}|${bound[1]}`) ?? 0 } };
    }
    if (sql.includes('SELECT * FROM users WHERE email = ?')) {
      return { changes: 0, row: users.find((u) => u.email === bound[0]) ?? null };
    }
    if (sql.includes('INSERT INTO password_reset_tokens')) {
      tokens.push({
        id: String(bound[0]),
        user_id: String(bound[1]),
        token_hash: String(bound[2]),
        expires_at: Number(bound[3]),
        used_at: null,
        created_at: Number(bound[4]),
      });
      return { changes: 1, row: null };
    }
    if (sql.includes('UPDATE password_reset_tokens') && sql.includes('RETURNING user_id')) {
      const [now, hash] = bound as [number, string, number];
      const row = tokens.find(
        (t) => t.token_hash === hash && t.used_at === null && t.expires_at > now,
      );
      if (!row) return { changes: 0, row: null };
      row.used_at = now;
      return { changes: 1, row: { user_id: row.user_id } };
    }
    if (sql.includes('UPDATE password_reset_tokens') && sql.includes('WHERE user_id = ?')) {
      const [now, userId] = bound as [number, string];
      let changes = 0;
      for (const t of tokens) {
        if (t.user_id === userId && t.used_at === null) {
          t.used_at = now;
          changes += 1;
        }
      }
      return { changes, row: null };
    }
    if (sql.includes('UPDATE users SET hashed_password')) {
      const user = users.find((u) => u.id === bound[2]);
      if (user) {
        user.hashed_password = String(bound[0]);
        user.salt = null;
      }
      return { changes: user ? 1 : 0, row: null };
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
    async batch(stmts: Array<{ __exec: () => unknown }>) {
      return stmts.map((s) => s.__exec());
    },
  };
  return { db: db as unknown as D1Database, tokens, users };
}

function user(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    email: 'cook@example.com',
    hashed_password: 'old',
    salt: null,
    role: 'user',
    google_id: null,
    is_guest: 0,
    first_name: 'A',
    last_name: 'B',
    name: 'A B',
    ...overrides,
  };
}

function envFor(db: D1Database, extra: Partial<Env> = {}): Env {
  return {
    DB: db,
    FRONTEND_URL: 'https://lardermind.com',
    RESEND_API_KEY: 're_test',
    MAIL_FROM: 'LarderMind <no-reply@lardermind.com>',
    ...extra,
  } as Env;
}

function post(path: string, body: unknown, env: Env) {
  return passwordResetRoutes.request(
    path,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '1.2.3.4' },
      body: JSON.stringify(body),
    },
    env,
  );
}

function mockResend() {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('{}', { status: 200 });
    }),
  );
  return calls;
}

function tokenFromMail(body: Record<string, unknown>): string {
  const match = String(body.text).match(/reset-password\?token=([0-9a-f]+)/);
  if (!match) throw new Error('no reset link in mail');
  return match[1]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/auth/password-reset/request', () => {
  it('returns the same generic response for known and unknown emails', async () => {
    const calls = mockResend();
    const { db } = fakeDb([user()]);
    const env = envFor(db);

    const known = await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, env);
    const unknown = await post('/api/auth/password-reset/request', { email: 'nobody@example.com' }, env);

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    const a = await known.json();
    const b = await unknown.json();
    expect(a).toEqual(b);
    expect(a.data.message).toBe(PASSWORD_RESET_REQUEST_MESSAGE);
    expect(calls).toHaveLength(1);
  });

  it('emails a FRONTEND_URL/reset-password link and stores only a hash', async () => {
    const calls = mockResend();
    const { db, tokens } = fakeDb([user()]);
    await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, envFor(db));

    expect(calls[0]!.url).toBe('https://api.resend.com/emails');
    expect(calls[0]!.body.to).toEqual(['cook@example.com']);
    const token = tokenFromMail(calls[0]!.body);
    expect(String(calls[0]!.body.text)).toContain(
      `https://lardermind.com/reset-password?token=${token}`,
    );
    expect(tokens).toHaveLength(1);
    expect(tokens[0]!.token_hash).not.toBe(token);
    expect(tokens[0]!.token_hash).toBe(await hashResetToken(token));
    expect(tokens[0]!.expires_at - tokens[0]!.created_at).toBe(3600);
  });

  it('does not issue tokens for guest accounts', async () => {
    const calls = mockResend();
    const { db, tokens } = fakeDb([user({ is_guest: 1, role: 'guest' })]);
    const res = await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, envFor(db));
    expect(res.status).toBe(200);
    expect(calls).toHaveLength(0);
    expect(tokens).toHaveLength(0);
  });

  it('silently stops emailing after the per-email cap', async () => {
    const calls = mockResend();
    const { db } = fakeDb([user()]);
    const env = envFor(db);
    for (let i = 0; i < 5; i++) {
      const res = await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, env);
      expect(res.status).toBe(200);
    }
    expect(calls).toHaveLength(3);
  });
});

describe('POST /api/auth/password-reset/confirm', () => {
  it('sets the new password once and rejects reuse of the token', async () => {
    const calls = mockResend();
    const { db, users } = fakeDb([user()]);
    const env = envFor(db);
    await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, env);
    const token = tokenFromMail(calls[0]!.body);

    const first = await post('/api/auth/password-reset/confirm', { token, password: 'n3w-password' }, env);
    expect(first.status).toBe(200);
    const check = await verifyPassword('n3w-password', users[0]!.hashed_password, null);
    expect(check.ok).toBe(true);

    const second = await post('/api/auth/password-reset/confirm', { token, password: 'another-pass' }, env);
    expect(second.status).toBe(400);
    expect((await second.json()).code).toBe('reset_token_invalid');
    expect((await verifyPassword('n3w-password', users[0]!.hashed_password, null)).ok).toBe(true);
  });

  it('only the latest emailed link works', async () => {
    const calls = mockResend();
    const { db } = fakeDb([user()]);
    const env = envFor(db);
    await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, env);
    await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, env);
    const older = tokenFromMail(calls[0]!.body);
    const res = await post('/api/auth/password-reset/confirm', { token: older, password: 'n3w-password' }, env);
    expect(res.status).toBe(400);
  });

  it('rejects expired tokens', async () => {
    const calls = mockResend();
    const { db, tokens } = fakeDb([user()]);
    const env = envFor(db);
    await post('/api/auth/password-reset/request', { email: 'cook@example.com' }, env);
    tokens[0]!.expires_at = Math.floor(Date.now() / 1000) - 1;
    const token = tokenFromMail(calls[0]!.body);
    const res = await post('/api/auth/password-reset/confirm', { token, password: 'n3w-password' }, env);
    expect(res.status).toBe(400);
  });

  it('enforces the signup password rule', async () => {
    const { db } = fakeDb([user()]);
    const res = await post(
      '/api/auth/password-reset/confirm',
      { token: 'a'.repeat(64), password: 'short' },
      envFor(db),
    );
    expect(res.status).toBe(400);
  });
});

describe('mailer', () => {
  it('logs and no-ops when RESEND_API_KEY / MAIL_FROM are missing', async () => {
    const fetchSpy = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = await sendMail(
      {},
      { to: 'cook@example.com', subject: 's', text: 'secret link' },
      fetchSpy as unknown as typeof fetch,
    );
    expect(result).toEqual({ sent: false, reason: 'not_configured' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0])).not.toContain('secret link');
    warn.mockRestore();
  });

  it('mentions Google sign-in for Google-linked accounts', () => {
    const mail = buildPasswordResetEmail('https://x/reset-password?token=t', { hasGoogleSignIn: true });
    expect(mail.text).toMatch(/Sign in with Google/);
  });
});
