import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  getOrCreatePreferences,
  toPreferencesDto,
  upsertPreferences,
  type UserPreferencesInput,
} from '../db/preferences';

export const preferencesRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

preferencesRoutes.use('/api/user-preferences', requireAuth);
preferencesRoutes.use('/api/user-preferences/*', requireAuth);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function parseStringArray(raw: unknown): string[] | undefined {
  if (raw === undefined) return undefined;
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

function parseInput(body: unknown): UserPreferencesInput {
  const root = asRecord(body);
  if (!root) return {};

  const input: UserPreferencesInput = {};
  const allergies = parseStringArray(root.allergies);
  if (allergies !== undefined) input.allergies = allergies;
  const dislikes = parseStringArray(root.dislikes);
  if (dislikes !== undefined) input.dislikes = dislikes;
  const likes = parseStringArray(root.likes);
  if (likes !== undefined) input.likes = likes;
  const dietaryRestrictions = parseStringArray(root.dietaryRestrictions);
  if (dietaryRestrictions !== undefined) {
    input.dietaryRestrictions = dietaryRestrictions;
  }
  if (typeof root.householdNotes === 'string') {
    input.householdNotes = root.householdNotes;
  }
  if (typeof root.measurementUnit === 'string') {
    input.measurementUnit = root.measurementUnit;
  }
  if (typeof root.notes === 'string') input.notes = root.notes;
  return input;
}

preferencesRoutes.get('/api/user-preferences', async (c) => {
  const userId = c.get('userId');
  const row = await getOrCreatePreferences(c.env.DB, userId);
  return c.json(ok(toPreferencesDto(row)));
});

preferencesRoutes.put('/api/user-preferences', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }

  const row = await upsertPreferences(c.env.DB, userId, parseInput(body));
  return c.json(ok(toPreferencesDto(row)));
});
