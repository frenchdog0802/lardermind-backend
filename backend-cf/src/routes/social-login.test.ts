import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { makeIdTokenIssuer } from '../test-utils/id-token-fixtures';
import type { Env } from '../env';

const issuer = await makeIdTokenIssuer();

// Real verification logic, but against a local key set instead of Apple/Google's remote JWKS.
vi.mock('../lib/apple-id-token', async (orig) => {
  const mod = await orig<typeof import('../lib/apple-id-token')>();
  return {
    ...mod,
    verifyAppleIdentityToken: (t: string, b: string) => mod.verifyAppleIdentityToken(t, b, issuer.keys),
  };
});
vi.mock('../lib/google-id-token', async (orig) => {
  const mod = await orig<typeof import('../lib/google-id-token')>();
  return {
    ...mod,
    verifyGoogleIdToken: (t: string, c: string | string[]) => mod.verifyGoogleIdToken(t, c, issuer.keys),
  };
});

const { authRoutes } = await import('./auth');
const { softDeleteUser } = await import('../db/users');

const SECRET = 's'.repeat(40);
const BUNDLE = 'com.lardermind.app';
const APPLE_ISS = 'https://appleid.apple.com';

let env: Env;
let sqlite: import('node:sqlite').DatabaseSync;
let db: D1Database;
let app: Hono<{ Bindings: Env }>;

function post(path: string, body: unknown, ip = '1.1.1.1') {
  return app.request(
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip },
      body: JSON.stringify(body),
    },
    env,
  );
}

const appleToken = (claims: Record<string, unknown>, aud = BUNDLE) =>
  issuer.sign(claims, { iss: APPLE_ISS, aud });

beforeEach(() => {
  const h = createSqliteD1();
  sqlite = h.sqlite;
  db = h.db;
  env = {
    DB: db,
    JWT_SECRET: SECRET,
    JWT_EXPIRES_IN_SECONDS: '3600',
    GOOGLE_CLIENT_ID: 'web-id',
    GOOGLE_IOS_CLIENT_ID: 'ios-id',
  } as unknown as Env;
  app = new Hono<{ Bindings: Env }>();
  app.route('/', authRoutes);
});

describe('POST /api/auth/apple-login', () => {
  it('creates a user on first sign-in using the client name, returns token + user', async () => {
    const identityToken = await appleToken({
      sub: 'apple-1',
      email: 'abc@privaterelay.appleid.com',
      email_verified: 'true',
    });
    const res = await post('/api/auth/apple-login', {
      identityToken,
      fullName: { givenName: 'Ann', familyName: 'Lee' },
    });
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.success).toBe(true);
    expect(json.data.token).toBeTruthy();
    expect(json.data.user).toMatchObject({
      email: 'abc@privaterelay.appleid.com',
      first_name: 'Ann',
      last_name: 'Lee',
      name: 'Ann Lee',
    });
    const row = sqlite.prepare('SELECT apple_id FROM users').get() as any;
    expect(row.apple_id).toBe('apple-1');
    expect((sqlite.prepare('SELECT COUNT(*) c FROM usage_quotas').get() as any).c).toBe(1);
  });

  it('returns the same user on repeat sign-in (no name/email sent the second time)', async () => {
    const t1 = await appleToken({ sub: 'apple-1', email: 'a@x.com', email_verified: true });
    const first = (await (await post('/api/auth/apple-login', { identityToken: t1, fullName: 'Ann Lee' })).json()) as any;
    const t2 = await appleToken({ sub: 'apple-1' });
    const second = (await (await post('/api/auth/apple-login', { identityToken: t2 })).json()) as any;
    expect(second.data.user.id).toBe(first.data.user.id);
    expect((sqlite.prepare('SELECT COUNT(*) c FROM users').get() as any).c).toBe(1);
  });

  it('works when the token has no email: uses client email, else a placeholder', async () => {
    const r1 = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-a' }),
      email: 'client@x.com',
    })).json()) as any;
    expect(r1.data.user.email).toBe('client@x.com');
    const r2 = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-b' }),
    })).json()) as any;
    expect(r2.data.user.email).toMatch(/@apple\.lardermind\.local$/);
    expect(r2.data.user.first_name).toBeTruthy();
  });

  it('links to an existing account by VERIFIED token email only', async () => {
    sqlite
      .prepare(`INSERT INTO users (id, first_name, last_name, name, email) VALUES ('u1','A','B','A B','a@x.com')`)
      .run();
    const linked = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-1', email: 'a@x.com', email_verified: 'true' }),
    })).json()) as any;
    expect(linked.data.user.id).toBe('u1');
    expect((sqlite.prepare(`SELECT apple_id FROM users WHERE id='u1'`).get() as any).apple_id).toBe('apple-1');

    // Unverified token email and a spoofed client email must NOT take over an existing account.
    sqlite
      .prepare(`INSERT INTO users (id, first_name, last_name, name, email) VALUES ('u2','C','D','C D','victim@x.com')`)
      .run();
    const other = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-2', email: 'victim@x.com', email_verified: 'false' }),
      email: 'victim@x.com',
    })).json()) as any;
    expect(other.data.user.id).not.toBe('u2');
    const spoof = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-3' }),
      email: 'victim@x.com',
    })).json()) as any;
    expect(spoof.data.user.id).not.toBe('u2');
    expect(spoof.data.user.email).toMatch(/@apple\.lardermind\.local$/);
  });

  it('rejects invalid, wrong-audience, expired and forged tokens with 400', async () => {
    const bad = [
      await appleToken({ sub: 'a' }, 'com.other.app'),
      await issuer.sign({ sub: 'a' }, { iss: 'https://evil.example.com', aud: BUNDLE }),
      await issuer.sign({ sub: 'a' }, { iss: APPLE_ISS, aud: BUNDLE, expSeconds: -60 }),
      await issuer.sign({ sub: 'a' }, { iss: APPLE_ISS, aud: BUNDLE, wrongKey: true }),
      'garbage',
    ];
    for (const identityToken of bad) {
      const res = await post('/api/auth/apple-login', { identityToken });
      expect(res.status).toBe(400);
      expect(((await res.json()) as any).success).toBe(false);
    }
    expect((sqlite.prepare('SELECT COUNT(*) c FROM users').get() as any).c).toBe(0);
    expect((await post('/api/auth/apple-login', {})).status).toBe(400);
  });

  it('honors APPLE_BUNDLE_ID override', async () => {
    env.APPLE_BUNDLE_ID = 'com.custom.app';
    const ok = await post('/api/auth/apple-login', { identityToken: await appleToken({ sub: 'a' }, 'com.custom.app') });
    expect(ok.status).toBe(200);
    const no = await post('/api/auth/apple-login', { identityToken: await appleToken({ sub: 'b' }) });
    expect(no.status).toBe(400);
  });

  it('rate limits per IP', async () => {
    let last = 0;
    for (let i = 0; i < 32; i++) {
      last = (await post('/api/auth/apple-login', { identityToken: 'x.y.z' }, '9.9.9.9')).status;
    }
    expect(last).toBe(429);
  });

  it('after account deletion the Apple id is freed and a new account is created', async () => {
    const first = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-1' }),
    })).json()) as any;
    expect(await softDeleteUser(db, first.data.user.id)).toBe(true);
    const again = (await (await post('/api/auth/apple-login', {
      identityToken: await appleToken({ sub: 'apple-1' }),
    })).json()) as any;
    expect(again.success).toBe(true);
    expect(again.data.user.id).not.toBe(first.data.user.id);
    expect(
      (sqlite.prepare(`SELECT deleted_apple_id d FROM users WHERE id = ?`).get(first.data.user.id) as any).d,
    ).toBe('apple-1');
  });
});

describe('POST /api/auth/google-login (web + iOS audiences)', () => {
  const claims = { sub: 'g1', email: 'g@x.com', email_verified: true, given_name: 'Gus', family_name: 'Doe' };
  const gTok = (aud: string) => issuer.sign(claims, { iss: 'https://accounts.google.com', aud });

  it('accepts tokens minted for the web client and for the iOS client, same user', async () => {
    const a = (await (await post('/api/auth/google-login', { token: await gTok('web-id') })).json()) as any;
    const b = (await (await post('/api/auth/google-login', { token: await gTok('ios-id') })).json()) as any;
    expect(a.success && b.success).toBe(true);
    expect(a.data.user.id).toBe(b.data.user.id);
    expect(a.data.user.email).toBe('g@x.com');
  });

  it('rejects an unknown audience', async () => {
    const res = await post('/api/auth/google-login', { token: await gTok('someone-else') });
    expect(res.status).toBe(400);
  });

  it('500s when no Google client id is configured', async () => {
    env.GOOGLE_CLIENT_ID = '';
    env.GOOGLE_IOS_CLIENT_ID = undefined;
    const res = await post('/api/auth/google-login', { token: await gTok('web-id') });
    expect(res.status).toBe(500);
  });
});
