import { Hono } from 'hono';
import type { Env } from '../env';
import {
  isValidMediaPath,
  MEDIA_CACHE_CONTROL,
} from '../lib/media';

export const mediaRoutes = new Hono<{ Bindings: Env }>();

mediaRoutes.get('/api/media/:userId/:objectName', async (c) => {
  const userId = c.req.param('userId');
  const objectName = c.req.param('objectName');

  if (!isValidMediaPath(userId, objectName)) {
    return c.body(null, 404);
  }

  const key = `${userId}/${objectName}`;
  const object = await c.env.R2.get(key);
  if (!object) {
    return c.body(null, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('Cache-Control', MEDIA_CACHE_CONTROL);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/octet-stream');
  }

  return new Response(object.body, { status: 200, headers });
});
