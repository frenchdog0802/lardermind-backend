import type { Context, Next } from 'hono';
import type { Env } from '../env';

const REQUEST_ID_RE = /^[A-Za-z0-9._:-]{1,80}$/;

export type RequestLogVariables = {
  requestId: string;
};

export function resolveRequestId(header: string | undefined): string {
  const trimmed = header?.trim() ?? '';
  if (REQUEST_ID_RE.test(trimmed)) return trimmed;
  return crypto.randomUUID();
}

export function requestLogLine(input: {
  requestId: string;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  level?: 'info' | 'error';
  error?: string;
}): string {
  return JSON.stringify({
    level: input.level ?? 'info',
    msg: input.error ? 'unhandled' : 'request',
    requestId: input.requestId,
    method: input.method,
    path: input.path,
    status: input.status,
    durationMs: input.durationMs,
    ...(input.error ? { error: input.error } : {}),
  });
}

export async function requestLogMiddleware(
  c: Context<{ Bindings: Env; Variables: RequestLogVariables }>,
  next: Next,
) {
  const requestId = resolveRequestId(c.req.header('X-Request-Id'));
  c.set('requestId', requestId);
  const started = Date.now();
  const path = new URL(c.req.url).pathname;
  let thrown: unknown;
  try {
    await next();
  } catch (error) {
    thrown = error;
    throw error;
  } finally {
    const status = thrown ? 500 : c.res.status;
    console.log(
      requestLogLine({
        requestId,
        method: c.req.method,
        path,
        status,
        durationMs: Date.now() - started,
        level: thrown ? 'error' : 'info',
        error: thrown instanceof Error ? thrown.message : undefined,
      }),
    );
  }

  const contentType = c.res.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    c.header('X-Request-Id', requestId);
    return;
  }

  let body: unknown;
  try {
    body = await c.res.clone().json();
  } catch {
    c.header('X-Request-Id', requestId);
    return;
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    c.header('X-Request-Id', requestId);
    return;
  }
  const record = body as Record<string, unknown>;
  if (record.success !== false) {
    c.header('X-Request-Id', requestId);
    return;
  }
  const nextBody = {
    ...record,
    code: typeof record.code === 'string' && record.code ? record.code : 'error',
    requestId,
  };
  const headers = new Headers(c.res.headers);
  headers.set('X-Request-Id', requestId);
  headers.set('content-type', 'application/json; charset=UTF-8');
  c.res = new Response(JSON.stringify(nextBody), {
    status: c.res.status,
    headers,
  });
}
