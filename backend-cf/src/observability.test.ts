import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import worker from './index';
import type { Env } from './env';
import { buildOpenApiDocument } from './openapi/spec';
import { requestLogLine, resolveRequestId } from './middleware/request-log';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('migration 0011', () => {
  it('is additive', () => {
    const sql = readFileSync(
      join(root, 'migrations/0011_backend_hardening.sql'),
      'utf8',
    );
    expect(sql.toLowerCase()).not.toContain('drop ');
    expect(sql).toContain('ADD COLUMN version');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS auth_rate_limits');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS idempotency_records');
    expect(sql).toContain('pending_claim_token');
  });
});

describe('openapi', () => {
  it('publishes resume and shopping contracts from the zod schemas', () => {
    const doc = buildOpenApiDocument();
    expect(doc.paths['/api/chat/resume']?.post).toBeTruthy();
    expect(doc.paths['/api/shopping-list']?.post).toBeTruthy();
    expect(doc.paths['/api/shopping-list/{id}']?.put).toBeTruthy();
    expect(doc.paths['/api/shopping-list/{id}']?.delete).toBeTruthy();
    const resume = doc.components.schemas.ChatResumeBody as {
      properties: Record<string, { enum?: string[] }>;
    };
    expect(resume.properties.decision?.enum).toEqual(['approve', 'reject']);
    expect(resume.properties.interruptId).toBeTruthy();
    const shopping = doc.components.schemas.ShoppingWriteBody as {
      properties: Record<string, unknown>;
    };
    expect(shopping.properties.version).toBeTruthy();
  });
});

describe('request logging', () => {
  it('keeps a safe client request id and writes a JSON access line', async () => {
    expect(resolveRequestId('bad id')).not.toBe('bad id');
    expect(resolveRequestId('req_123')).toBe('req_123');

    const logs: string[] = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((msg) => {
      logs.push(String(msg));
    });
    const env = { CORS_ALLOWED_ORIGINS: '*' } as Env;
    const res = await worker.fetch(
      new Request('http://example.com/api/health', {
        headers: { 'X-Request-Id': 'req_123' },
      }),
      env,
    );
    expect(res.headers.get('X-Request-Id')).toBe('req_123');
    const line = logs.map(String).find((entry) => entry.includes('"msg":"request"'));
    expect(line).toBeTruthy();
    const parsed = JSON.parse(line ?? '{}') as { requestId: string; path: string; status: number };
    expect(parsed.requestId).toBe('req_123');
    expect(parsed.path).toBe('/api/health');
    expect(parsed.status).toBe(200);
    spy.mockRestore();

    const missing = await worker.fetch(
      new Request('http://example.com/api/does-not-exist'),
      env,
    );
    expect(missing.status).toBe(404);
    const body = (await missing.json()) as { code: string; requestId: string };
    expect(body.code).toBe('not_found');
    expect(body.requestId).toBeTruthy();
  });

  it('formats a log line without a body', () => {
    const line = requestLogLine({
      requestId: 'r1',
      method: 'POST',
      path: '/api/auth/signin',
      status: 401,
      durationMs: 4,
    });
    const parsed = JSON.parse(line) as { path: string; password?: string };
    expect(parsed.path).toBe('/api/auth/signin');
    expect(parsed.password).toBeUndefined();
  });
});
