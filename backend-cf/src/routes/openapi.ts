import { Hono } from 'hono';
import type { Env } from '../env';
import { buildOpenApiDocument } from '../openapi/spec';

export const openApiRoutes = new Hono<{ Bindings: Env }>();

openApiRoutes.get('/api/openapi.json', (c) => c.json(buildOpenApiDocument()));
