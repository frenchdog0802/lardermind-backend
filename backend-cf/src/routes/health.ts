import { Hono } from 'hono';
import { ok } from '../lib/api-response';
import { nowUnixSeconds } from '../lib/time';
import type { Env } from '../env';

export const healthRoutes = new Hono<{ Bindings: Env }>();

healthRoutes.get('/api/health', (c) =>
  c.json(
    ok({
      status: 'UP',
      timestamp: nowUnixSeconds(),
      runtime: 'cloudflare-workers',
    }),
  ),
);
