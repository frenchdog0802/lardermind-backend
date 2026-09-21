import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  createFolder,
  deleteFolder,
  getFolder,
  listFolders,
  toFolderDto,
  updateFolder,
  type FolderInput,
  type FolderPatch,
} from '../db/folder';

export const folderRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

folderRoutes.use('/api/folder', requireAuth);
folderRoutes.use('/api/folder/*', requireAuth);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function parseCreateInput(
  body: unknown,
): { ok: true; value: FolderInput } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const name = typeof root.name === 'string' ? root.name.trim() : '';
  if (!name) return { ok: false, message: 'Name is required' };
  const value: FolderInput = { name };
  if (typeof root.icon === 'string') value.icon = root.icon;
  return { ok: true, value };
}

function parsePatchInput(
  body: unknown,
): { ok: true; value: FolderPatch } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const patch: FolderPatch = {};
  if (root.name !== undefined) {
    if (typeof root.name !== 'string' || !root.name.trim()) {
      return { ok: false, message: 'Name is required' };
    }
    patch.name = root.name.trim();
  }
  if (root.icon !== undefined) {
    patch.icon = typeof root.icon === 'string' ? root.icon : '';
  }
  return { ok: true, value: patch };
}

folderRoutes.get('/api/folder', async (c) => {
  const userId = c.get('userId');
  const rows = await listFolders(c.env.DB, userId, c.req.query('q'));
  return c.json(ok(rows.map(toFolderDto)));
});

folderRoutes.post('/api/folder', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const row = await createFolder(c.env.DB, userId, parsed.value);
  return c.json(ok(toFolderDto(row)), 201);
});

folderRoutes.get('/api/folder/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getFolder(c.env.DB, userId, c.req.param('id'));
  if (!row) return c.json(fail('Not found'), 404);
  return c.json(ok(toFolderDto(row)));
});

folderRoutes.put('/api/folder/:id', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parsePatchInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const updated = await updateFolder(
    c.env.DB,
    userId,
    c.req.param('id'),
    parsed.value,
  );
  if (!updated) return c.json(fail('Not found'), 404);
  return c.json(ok(toFolderDto(updated)));
});

folderRoutes.delete('/api/folder/:id', async (c) => {
  const userId = c.get('userId');
  const deleted = await deleteFolder(c.env.DB, userId, c.req.param('id'));
  if (!deleted) return c.json(fail('Not found'), 404);
  return c.json(ok(null));
});
