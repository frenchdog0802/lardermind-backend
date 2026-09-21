import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { signJwt } from '../lib/jwt';
import { uploadRoutes } from '../routes/upload';
import { mediaRoutes } from '../routes/media';
import type { Env } from '../env';
import { FREE_IMAGE_UPLOAD_LIMIT } from '../db/quotas';

const JWT_SECRET = 'x'.repeat(32);
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

type StoredObject = {
  body: ArrayBuffer;
  contentType: string;
};

function createMockR2() {
  const store = new Map<string, StoredObject>();

  const r2 = {
    async put(
      key: string,
      value: ArrayBuffer | ArrayBufferView | string | Blob | ReadableStream,
      options?: R2PutOptions,
    ) {
      let body: ArrayBuffer;
      if (value instanceof ArrayBuffer) {
        body = value;
      } else if (ArrayBuffer.isView(value)) {
        body = value.buffer.slice(
          value.byteOffset,
          value.byteOffset + value.byteLength,
        ) as ArrayBuffer;
      } else if (typeof value === 'string') {
        body = new TextEncoder().encode(value).buffer as ArrayBuffer;
      } else if (value instanceof Blob) {
        body = await value.arrayBuffer();
      } else {
        body = new ArrayBuffer(0);
      }
      store.set(key, {
        body,
        contentType:
          options?.httpMetadata?.contentType ?? 'application/octet-stream',
      });
      return { key } as R2Object;
    },
    async head(key: string) {
      return store.has(key) ? ({ key } as R2Object) : null;
    },
    async get(key: string) {
      const item = store.get(key);
      if (!item) return null;
      return {
        body: item.body,
        httpEtag: '"etag"',
        writeHttpMetadata(headers: Headers) {
          headers.set('Content-Type', item.contentType);
        },
      } as unknown as R2ObjectBody;
    },
    async delete(key: string) {
      store.delete(key);
    },
  };

  return { r2: r2 as unknown as R2Bucket, store };
}

type QuotaRow = {
  user_id: string;
  image_uploads: number;
  image_period_start: number | null;
  role?: string;
};

function createMockDb(users: Record<string, { role: string }>) {
  const quotas = new Map<string, QuotaRow>();

  for (const userId of Object.keys(users)) {
    quotas.set(userId, {
      user_id: userId,
      image_uploads: 0,
      image_period_start: Math.floor(Date.UTC(2026, 8, 1) / 1000),
    });
  }

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
            const id = bound[0] as string;
            const user = users[id];
            if (!user) return null;
            return { id, role: user.role } as T;
          }
          if (sql.includes('FROM usage_quotas') && sql.includes('SELECT')) {
            const userId = bound[0] as string;
            const row = quotas.get(userId);
            if (!row) return null;
            return {
              id: 'q-' + userId,
              user_id: row.user_id,
              image_uploads: row.image_uploads,
              image_period_start: row.image_period_start,
            } as T;
          }
          return null;
        },
        async run() {
          if (sql.includes('INSERT INTO usage_quotas')) {
            const userId = bound[1] as string;
            quotas.set(userId, {
              user_id: userId,
              image_uploads: 0,
              image_period_start: bound[3] as number,
            });
            return { success: true };
          }
          if (sql.includes('UPDATE usage_quotas')) {
            const userId = bound[3] as string;
            quotas.set(userId, {
              user_id: userId,
              image_uploads: bound[0] as number,
              image_period_start: bound[1] as number,
            });
            return { success: true };
          }
          return { success: true };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, quotas };
}

function createApp(env: Env) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', uploadRoutes);
  app.route('/', mediaRoutes);
  app.use('*', async (c, next) => {
    // no-op; bindings injected via request
    await next();
  });

  return {
    async request(input: string, init?: RequestInit) {
      return app.request(input, init, env);
    },
  };
}

async function authHeader(userId: string): Promise<string> {
  const token = await signJwt(userId, JWT_SECRET, 3600);
  return `Bearer ${token}`;
}

function jpegFile(bytes = 64, name = 'photo.jpg'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'image/jpeg' });
}

describe('upload / media routes', () => {
  let env: Env;
  let store: Map<string, StoredObject>;
  let quotas: Map<string, QuotaRow>;

  beforeEach(() => {
    const r2Mock = createMockR2();
    const dbMock = createMockDb({
      [USER_A]: { role: 'user' },
      [USER_B]: { role: 'user' },
    });
    store = r2Mock.store;
    quotas = dbMock.quotas;
    env = {
      DB: dbMock.db,
      AI: {} as Ai,
      R2: r2Mock.r2,
      JWT_SECRET,
      CORS_ALLOWED_ORIGINS: '*',
      JWT_EXPIRES_IN_SECONDS: '3600',
      GOOGLE_CLIENT_ID: 'test-google-client-id.apps.googleusercontent.com',
      FRONTEND_URL: 'http://localhost:5173',
      CF_ACCOUNT_ID: 'test-account',
      AI_GATEWAY_ID: 'default',
    };
  });

  it('uploads jpeg via image field alias', async () => {
    const app = createApp(env);
    const form = new FormData();
    form.append('image', jpegFile());

    const uploadRes = await app.request('http://example.com/api/upload/image', {
      method: 'POST',
      headers: { Authorization: await authHeader(USER_A) },
      body: form,
    });
    expect(uploadRes.status).toBe(200);
    const json = (await uploadRes.json()) as {
      success: boolean;
      data: { imageUrl: string; publicId: string; image_url: string; public_id: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.image_url).toBe(json.data.imageUrl);
    expect(json.data.public_id).toBe(json.data.publicId);
  });

  it('uploads jpeg and serves media without JWT', async () => {
    const app = createApp(env);
    const form = new FormData();
    form.append('file', jpegFile());

    const uploadRes = await app.request('http://example.com/api/upload/image', {
      method: 'POST',
      headers: { Authorization: await authHeader(USER_A) },
      body: form,
    });
    expect(uploadRes.status).toBe(200);
    const json = (await uploadRes.json()) as {
      success: boolean;
      data: { imageUrl: string; publicId: string };
    };
    expect(json.success).toBe(true);
    expect(json.data.publicId.startsWith(`${USER_A}/`)).toBe(true);
    expect(store.has(json.data.publicId)).toBe(true);

    const mediaRes = await app.request(json.data.imageUrl);
    expect(mediaRes.status).toBe(200);
    expect(mediaRes.headers.get('Content-Type')).toBe('image/jpeg');
    expect(mediaRes.headers.get('Cache-Control')).toContain('immutable');
  });

  it('rejects wrong MIME and oversize', async () => {
    const app = createApp(env);

    const badForm = new FormData();
    badForm.append(
      'file',
      new File([new Uint8Array(8)], 'x.txt', { type: 'text/plain' }),
    );
    const badMime = await app.request('http://example.com/api/upload/image', {
      method: 'POST',
      headers: { Authorization: await authHeader(USER_A) },
      body: badForm,
    });
    expect(badMime.status).toBe(400);

    const bigForm = new FormData();
    bigForm.append(
      'file',
      new File([new Uint8Array(8 * 1024 * 1024 + 1)], 'big.jpg', {
        type: 'image/jpeg',
      }),
    );
    const oversize = await app.request('http://example.com/api/upload/image', {
      method: 'POST',
      headers: { Authorization: await authHeader(USER_A) },
      body: bigForm,
    });
    expect(oversize.status).toBe(413);
  });

  it('returns 403 on 11th free upload', async () => {
    const app = createApp(env);
    quotas.set(USER_A, {
      user_id: USER_A,
      image_uploads: FREE_IMAGE_UPLOAD_LIMIT,
      image_period_start: Math.floor(Date.UTC(2026, 8, 1) / 1000),
    });

    const form = new FormData();
    form.append('file', jpegFile());
    const res = await app.request('http://example.com/api/upload/image', {
      method: 'POST',
      headers: { Authorization: await authHeader(USER_A) },
      body: form,
    });
    expect(res.status).toBe(403);
  });

  it('deletes own object and forbids cross-user delete', async () => {
    const app = createApp(env);
    const publicId = `${USER_A}/22222222-2222-2222-2222-222222222222.jpg`;
    store.set(publicId, {
      body: new Uint8Array([1, 2, 3]).buffer,
      contentType: 'image/jpeg',
    });

    const forbidden = await app.request(
      `http://example.com/api/upload/image/${publicId}`,
      {
        method: 'DELETE',
        headers: { Authorization: await authHeader(USER_B) },
      },
    );
    expect(forbidden.status).toBe(403);
    expect(store.has(publicId)).toBe(true);

    const okDel = await app.request(
      `http://example.com/api/upload/image/${publicId}`,
      {
        method: 'DELETE',
        headers: { Authorization: await authHeader(USER_A) },
      },
    );
    expect(okDel.status).toBe(200);
    expect(store.has(publicId)).toBe(false);

    const missing = await app.request(
      `http://example.com/api/upload/image/${publicId}`,
      {
        method: 'DELETE',
        headers: { Authorization: await authHeader(USER_A) },
      },
    );
    expect(missing.status).toBe(404);
  });

  it('returns 404 for garbage media paths', async () => {
    const app = createApp(env);
    const res = await app.request(
      'http://example.com/api/media/not-uuid/../evil.jpg',
    );
    expect(res.status).toBe(404);
  });
});
