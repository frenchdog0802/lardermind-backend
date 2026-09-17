import type { Context, Next } from 'hono';
import type { Env } from '../env';

function allowedOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

export async function corsMiddleware(c: Context<{ Bindings: Env }>, next: Next) {
  const origin = c.req.header('Origin') ?? '';
  const allowed = allowedOrigins(c.env.CORS_ALLOWED_ORIGINS);
  const isAllowed = !origin || allowed.includes(origin) || allowed.includes('*');

  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(isAllowed ? origin : '', allowed),
    });
  }

  await next();

  if (isAllowed && origin) {
    c.res.headers.set('Access-Control-Allow-Origin', origin);
    c.res.headers.set('Access-Control-Allow-Credentials', 'true');
    c.res.headers.set('Vary', 'Origin');
  }
  c.res.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  c.res.headers.set(
    'Access-Control-Allow-Headers',
    'Authorization,Content-Type,Accept',
  );
}

function corsHeaders(origin: string, allowed: string[]): HeadersInit {
  const allowOrigin =
    origin || (allowed.includes('*') ? '*' : allowed[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept',
    Vary: 'Origin',
  };
}
