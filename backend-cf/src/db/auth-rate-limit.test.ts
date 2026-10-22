import { describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import {
  AUTH_LIMITS,
  AuthRateLimitError,
  assertAuthAllowed,
  signinEmailSubject,
} from './auth-rate-limit';
import { authRoutes } from '../routes/auth';
import type { Env } from '../env';

function rateLimitDb() {
  const rows = new Map<string, { attempts: number }>();
  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async first<T>() {
          if (sql.includes('FROM auth_rate_limits')) {
            const subjectHash = String(bound[0]);
            const bucket = Number(bound[1]);
            return (rows.get(`${subjectHash}:${bucket}`) ?? null) as T;
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO auth_rate_limits')) {
            const subjectHash = String(bound[1]);
            const bucket = Number(bound[2]);
            const key = `${subjectHash}:${bucket}`;
            const existing = rows.get(key);
            if (existing) existing.attempts += 1;
            else rows.set(key, { attempts: 1 });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
      return stmt;
    },
  };
  return db as unknown as D1Database;
}

describe('assertAuthAllowed', () => {
  it('allows up to the limit and then throws', async () => {
    const db = rateLimitDb();
    const now = 1_700_000_000;
    await assertAuthAllowed(db, 'signin:email:a@b.co', 2, 900, now);
    await assertAuthAllowed(db, 'signin:email:a@b.co', 2, 900, now);
    await expect(
      assertAuthAllowed(db, 'signin:email:a@b.co', 2, 900, now),
    ).rejects.toBeInstanceOf(AuthRateLimitError);
  });
});

describe('POST /api/auth/signin rate limit', () => {
  it('returns 429 when the email window is already full', async () => {
    const db = rateLimitDb();
    const email = 'a@b.co';
    for (let i = 0; i < AUTH_LIMITS.signinEmail; i++) {
      await assertAuthAllowed(db, signinEmailSubject(email), AUTH_LIMITS.signinEmail);
    }
    const app = new Hono<{ Bindings: Env }>();
    app.route('/', authRoutes);
    const env = { DB: db, CORS_ALLOWED_ORIGINS: '*' } as Env;
    const res = await app.request(
      '/api/auth/signin',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'whatever-password' }),
      },
      env,
    );
    expect(res.status).toBe(429);
    const body = (await res.json()) as { success: boolean; code: string };
    expect(body.success).toBe(false);
    expect(body.code).toBe('rate_limited');
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });
});
