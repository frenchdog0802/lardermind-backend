import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import { ErrorCodes } from '../lib/error-codes';
import { parseJsonBody } from '../lib/validate';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireNonGuest } from '../middleware/auth';
import {
  abortIdempotency,
  beginIdempotency,
  finishIdempotency,
  normalizeIdempotencyKey,
} from '../db/idempotency';
import {
  assertBatchSize,
  mergeAddShoppingListItem,
  deleteShoppingListItem,
  getShoppingListItem,
  listShoppingListItems,
  syncItemsToPantry,
  toShoppingListItemDto,
  unsyncItemsFromPantry,
  updateShoppingListItem,
  VersionConflictError,
  type ShoppingListItemRow,
} from '../db/shopping-list';
import {
  expectedVersionFromBody,
  normalizeShoppingCreate,
  normalizeShoppingPatch,
  normalizeSyncItems,
  normalizeUnsyncIds,
  shoppingWriteBodySchema,
  syncToPantryBodySchema,
  unsyncBodySchema,
} from '../schemas/shopping-list';

export const shoppingListRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

shoppingListRoutes.use('/api/shopping-list', requireAuth, requireNonGuest);
shoppingListRoutes.use('/api/shopping-list/*', requireAuth, requireNonGuest);

type JsonResult = { status: number; body: unknown };

function conflictResponse(row: ShoppingListItemRow): JsonResult {
  return {
    status: 409,
    body: {
      ...fail('Version conflict', ErrorCodes.VERSION_CONFLICT),
      data: { current: toShoppingListItemDto(row) },
    },
  };
}

function parseExpectedHeader(raw: string | undefined): number | undefined | 'invalid' {
  if (raw == null || raw.trim() === '') return undefined;
  if (!/^\d+$/.test(raw.trim())) return 'invalid';
  return Number(raw.trim());
}

function resolveExpectedVersion(
  fromBody: number | undefined,
  headerRaw: string | undefined,
): { ok: true; version?: number } | { ok: false; message: string } {
  const header = parseExpectedHeader(headerRaw);
  if (header === 'invalid') {
    return { ok: false, message: 'X-Expected-Version must be a non-negative integer' };
  }
  if (fromBody !== undefined && header !== undefined && fromBody !== header) {
    return { ok: false, message: 'version and X-Expected-Version disagree' };
  }
  return { ok: true, version: fromBody ?? header };
}

async function runIdempotent(
  c: { env: Env; req: { header: (name: string) => string | undefined; method: string }; get: (key: 'userId') => string; json: (body: unknown, status?: number) => Response; header: (name: string, value: string) => void },
  routeKey: string,
  run: () => Promise<JsonResult>,
): Promise<Response> {
  const parsedKey = normalizeIdempotencyKey(c.req.header('Idempotency-Key'));
  if (!parsedKey.ok) {
    return c.json(fail(parsedKey.message, ErrorCodes.VALIDATION_ERROR), 400);
  }
  const gate = await beginIdempotency(
    c.env.DB,
    c.get('userId'),
    parsedKey.key,
    c.req.method,
    routeKey,
  );
  if (gate.kind === 'replay') {
    c.header('Idempotency-Replayed', 'true');
    return c.json(gate.body, gate.status);
  }
  if (gate.kind === 'conflict') {
    return c.json(gate.body, gate.status);
  }
  try {
    const result = await run();
    if (gate.kind === 'owned' && parsedKey.key) {
      await finishIdempotency(
        c.env.DB,
        c.get('userId'),
        parsedKey.key,
        result.status,
        result.body,
      );
    }
    return c.json(result.body, result.status);
  } catch (error) {
    if (gate.kind === 'owned' && parsedKey.key) {
      await abortIdempotency(c.env.DB, c.get('userId'), parsedKey.key).catch(
        () => undefined,
      );
    }
    throw error;
  }
}

shoppingListRoutes.get('/api/shopping-list', async (c) => {
  const userId = c.get('userId');
  const query = c.req.query('query');
  const rows = await listShoppingListItems(c.env.DB, userId, query);
  return c.json(ok(rows.map(toShoppingListItemDto)));
});

shoppingListRoutes.post('/api/shopping-list', async (c) => {
  const userId = c.get('userId');
  return runIdempotent(c, 'POST /api/shopping-list', async () => {
    const parsed = await parseJsonBody(c, shoppingWriteBodySchema);
    if (!parsed.ok) {
      return { status: 400, body: fail(parsed.message, parsed.code) };
    }
    const input = normalizeShoppingCreate(parsed.data);
    if (!input.ok) return { status: 400, body: fail(input.message, ErrorCodes.VALIDATION_ERROR) };
    const { item: row } = await mergeAddShoppingListItem(c.env.DB, userId, input.value);
    return { status: 201, body: ok(toShoppingListItemDto(row)) };
  });
});

shoppingListRoutes.post('/api/shopping-list/sync-to-pantry', async (c) => {
  const userId = c.get('userId');
  const parsed = await parseJsonBody(c, syncToPantryBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const items = normalizeSyncItems(parsed.data, assertBatchSize);
  if (!items.ok) return c.json(fail(items.message, ErrorCodes.VALIDATION_ERROR), 400);
  const result = await syncItemsToPantry(c.env.DB, userId, items.value);
  return c.json(ok(result));
});

shoppingListRoutes.post('/api/shopping-list/unsync-from-pantry', async (c) => {
  const userId = c.get('userId');
  const parsed = await parseJsonBody(c, unsyncBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const ids = normalizeUnsyncIds(parsed.data, assertBatchSize);
  if (!ids.ok) return c.json(fail(ids.message, ErrorCodes.VALIDATION_ERROR), 400);
  const result = await unsyncItemsFromPantry(c.env.DB, userId, ids.value);
  return c.json(ok(result));
});

shoppingListRoutes.get('/api/shopping-list/:id', async (c) => {
  const userId = c.get('userId');
  const row = await getShoppingListItem(c.env.DB, userId, c.req.param('id'));
  if (!row) return c.json(fail('Not found', ErrorCodes.NOT_FOUND), 404);
  return c.json(ok(toShoppingListItemDto(row)));
});

shoppingListRoutes.put('/api/shopping-list/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  return runIdempotent(c, `PUT /api/shopping-list/${id}`, async () => {
    const parsed = await parseJsonBody(c, shoppingWriteBodySchema);
    if (!parsed.ok) return { status: 400, body: fail(parsed.message, parsed.code) };
    const expected = resolveExpectedVersion(
      expectedVersionFromBody(parsed.data),
      c.req.header('X-Expected-Version'),
    );
    if (!expected.ok) {
      return { status: 400, body: fail(expected.message, ErrorCodes.VALIDATION_ERROR) };
    }
    const patch = normalizeShoppingPatch(parsed.data);
    if (!patch.ok) {
      return { status: 400, body: fail(patch.message, ErrorCodes.VALIDATION_ERROR) };
    }
    try {
      const updated = await updateShoppingListItem(
        c.env.DB,
        userId,
        id,
        patch.value,
        expected.version,
      );
      if (!updated) return { status: 404, body: fail('Not found', ErrorCodes.NOT_FOUND) };
      return { status: 200, body: ok(toShoppingListItemDto(updated)) };
    } catch (error) {
      if (error instanceof VersionConflictError) return conflictResponse(error.current);
      throw error;
    }
  });
});

shoppingListRoutes.delete('/api/shopping-list/:id', async (c) => {
  const userId = c.get('userId');
  const id = c.req.param('id');
  return runIdempotent(c, `DELETE /api/shopping-list/${id}`, async () => {
    const queryVersion = c.req.query('version');
    let fromQuery: number | undefined;
    if (queryVersion != null && queryVersion.trim() !== '') {
      if (!/^\d+$/.test(queryVersion.trim())) {
        return {
          status: 400,
          body: fail('version must be a non-negative integer', ErrorCodes.VALIDATION_ERROR),
        };
      }
      fromQuery = Number(queryVersion.trim());
    }
    const expected = resolveExpectedVersion(fromQuery, c.req.header('X-Expected-Version'));
    if (!expected.ok) {
      return { status: 400, body: fail(expected.message, ErrorCodes.VALIDATION_ERROR) };
    }
    const deleted = await deleteShoppingListItem(
      c.env.DB,
      userId,
      id,
      expected.version,
    );
    if (deleted.status === 'not_found') {
      return { status: 404, body: fail('Not found', ErrorCodes.NOT_FOUND) };
    }
    if (deleted.status === 'conflict') return conflictResponse(deleted.item);
    return { status: 200, body: ok(null) };
  });
});
