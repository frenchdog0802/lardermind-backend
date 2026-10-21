import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireNonGuest } from '../middleware/auth';
import {
  listConversionsForUser,
  toUnitConversionDto,
  upsertConversion,
} from '../db/unit-conversions';

export const unitConversionRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

unitConversionRoutes.use('/api/unit-conversions', requireAuth, requireNonGuest);
unitConversionRoutes.use(
  '/api/unit-conversions/*',
  requireAuth,
  requireNonGuest,
);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

unitConversionRoutes.get('/api/unit-conversions', async (c) => {
  const userId = c.get('userId');
  const rows = await listConversionsForUser(c.env.DB, userId);
  return c.json(ok(rows.map(toUnitConversionDto)));
});

unitConversionRoutes.post('/api/unit-conversions', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }

  const root = asRecord(body);
  if (!root) return c.json(fail('Invalid body'), 400);

  const itemName =
    typeof root.itemName === 'string'
      ? root.itemName
      : typeof root.item === 'string'
        ? root.item
        : '';
  const baseUnit =
    typeof root.baseUnit === 'string'
      ? root.baseUnit
      : typeof root.from_unit === 'string'
        ? root.from_unit
        : '';
  const targetUnit =
    typeof root.targetUnit === 'string'
      ? root.targetUnit
      : typeof root.to_unit === 'string'
        ? root.to_unit
        : '';
  const ratioRaw = root.ratio;
  const ratio =
    typeof ratioRaw === 'number'
      ? ratioRaw
      : typeof ratioRaw === 'string'
        ? Number(ratioRaw)
        : NaN;

  if (!itemName.trim()) return c.json(fail('itemName is required'), 400);
  if (!baseUnit.trim() || !targetUnit.trim()) {
    return c.json(fail('baseUnit and targetUnit are required'), 400);
  }
  if (!(ratio > 0) || !Number.isFinite(ratio)) {
    return c.json(fail('ratio must be a positive number'), 400);
  }

  try {
    const row = await upsertConversion(c.env.DB, userId, {
      itemName,
      baseUnit,
      targetUnit,
      ratio,
    });
    return c.json(ok(toUnitConversionDto(row)));
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid conversion';
    return c.json(fail(message), 400);
  }
});
