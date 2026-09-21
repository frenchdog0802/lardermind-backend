import { nowUnixSeconds } from '../lib/time';

export type UserPreferencesRow = {
  id: string;
  user_id: string;
  household_notes: string | null;
  measurement_unit: string | null;
  notes: string | null;
  allergies_json: string | null;
  dislikes_json: string | null;
  likes_json: string | null;
  dietary_restrictions_json: string | null;
  created_at: number | null;
  updated_at: number | null;
};

export type UserPreferencesDto = {
  id: string;
  allergies: string[];
  dislikes: string[];
  likes: string[];
  dietaryRestrictions: string[];
  householdNotes: string;
  measurementUnit: 'metric' | 'imperial';
  notes: string;
};

export type UserPreferencesInput = Partial<{
  allergies: string[];
  dislikes: string[];
  likes: string[];
  dietaryRestrictions: string[];
  householdNotes: string;
  measurementUnit: string;
  notes: string;
}>;

function parseJsonArray(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === 'string')
      : [];
  } catch {
    return [];
  }
}

export function toPreferencesDto(row: UserPreferencesRow): UserPreferencesDto {
  return {
    id: row.id,
    allergies: parseJsonArray(row.allergies_json),
    dislikes: parseJsonArray(row.dislikes_json),
    likes: parseJsonArray(row.likes_json),
    dietaryRestrictions: parseJsonArray(row.dietary_restrictions_json),
    householdNotes: row.household_notes ?? '',
    measurementUnit:
      row.measurement_unit === 'imperial' ? 'imperial' : 'metric',
    notes: row.notes ?? '',
  };
}

export async function getPreferencesByUserId(
  db: D1Database,
  userId: string,
): Promise<UserPreferencesRow | null> {
  return db
    .prepare('SELECT * FROM user_preferences WHERE user_id = ? LIMIT 1')
    .bind(userId)
    .first<UserPreferencesRow>();
}

export async function getOrCreatePreferences(
  db: D1Database,
  userId: string,
): Promise<UserPreferencesRow> {
  const existing = await getPreferencesByUserId(db, userId);
  if (existing) return existing;

  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT INTO user_preferences
        (id, user_id, household_notes, measurement_unit, notes,
         allergies_json, dislikes_json, likes_json, dietary_restrictions_json,
         created_at, updated_at)
       VALUES (?, ?, '', 'metric', '', '[]', '[]', '[]', '[]', ?, ?)`,
    )
    .bind(id, userId, now, now)
    .run();

  const row = await getPreferencesByUserId(db, userId);
  if (!row) throw new Error('Failed to create user preferences');
  return row;
}

export async function upsertPreferences(
  db: D1Database,
  userId: string,
  input: UserPreferencesInput,
): Promise<UserPreferencesRow> {
  const existing = await getOrCreatePreferences(db, userId);
  const now = nowUnixSeconds();

  const allergies =
    input.allergies !== undefined
      ? JSON.stringify(input.allergies)
      : (existing.allergies_json ?? '[]');
  const dislikes =
    input.dislikes !== undefined
      ? JSON.stringify(input.dislikes)
      : (existing.dislikes_json ?? '[]');
  const likes =
    input.likes !== undefined
      ? JSON.stringify(input.likes)
      : (existing.likes_json ?? '[]');
  const dietaryRestrictions =
    input.dietaryRestrictions !== undefined
      ? JSON.stringify(input.dietaryRestrictions)
      : (existing.dietary_restrictions_json ?? '[]');
  const householdNotes =
    input.householdNotes !== undefined
      ? input.householdNotes
      : (existing.household_notes ?? '');
  const measurementUnit =
    input.measurementUnit !== undefined
      ? input.measurementUnit === 'imperial'
        ? 'imperial'
        : 'metric'
      : (existing.measurement_unit ?? 'metric');
  const notes =
    input.notes !== undefined ? input.notes : (existing.notes ?? '');

  await db
    .prepare(
      `UPDATE user_preferences
       SET household_notes = ?, measurement_unit = ?, notes = ?,
           allergies_json = ?, dislikes_json = ?, likes_json = ?,
           dietary_restrictions_json = ?, updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(
      householdNotes,
      measurementUnit,
      notes,
      allergies,
      dislikes,
      likes,
      dietaryRestrictions,
      now,
      userId,
    )
    .run();

  const row = await getPreferencesByUserId(db, userId);
  if (!row) throw new Error('Failed to load updated preferences');
  return row;
}
