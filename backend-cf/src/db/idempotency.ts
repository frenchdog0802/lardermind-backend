import { nowUnixSeconds } from '../lib/time';
import { ErrorCodes } from '../lib/error-codes';

const KEY_RE = /^[A-Za-z0-9._:-]{1,128}$/;
const RETENTION_SECONDS = 24 * 60 * 60;

export type IdempotencyGate =
  | { kind: 'skip' }
  | { kind: 'owned' }
  | { kind: 'replay'; status: number; body: unknown }
  | { kind: 'conflict'; status: number; body: unknown };

type IdempotencyRow = {
  method: string;
  route_key: string;
  status: number;
  response_json: string;
  created_at: number;
};

export function normalizeIdempotencyKey(
  raw: string | undefined | null,
): { ok: true; key: string | null } | { ok: false; message: string } {
  if (raw == null) return { ok: true, key: null };
  const key = raw.trim();
  if (!key) return { ok: true, key: null };
  if (!KEY_RE.test(key)) {
    return { ok: false, message: 'Invalid Idempotency-Key' };
  }
  return { ok: true, key };
}

function conflictBody(message: string, code: string) {
  return { success: false, message, code };
}

export async function beginIdempotency(
  db: D1Database,
  userId: string,
  key: string | null,
  method: string,
  routeKey: string,
  now = nowUnixSeconds(),
): Promise<IdempotencyGate> {
  if (!key) return { kind: 'skip' };

  await db
    .prepare(
      `DELETE FROM idempotency_records
       WHERE user_id = ? AND created_at < ?`,
    )
    .bind(userId, now - RETENTION_SECONDS)
    .run();

  const inserted = await db
    .prepare(
      `INSERT OR IGNORE INTO idempotency_records
        (user_id, idempotency_key, method, route_key, status, response_json, created_at)
       VALUES (?, ?, ?, ?, 0, '', ?)`,
    )
    .bind(userId, key, method, routeKey, now)
    .run();

  if ((inserted.meta?.changes ?? 0) > 0) {
    return { kind: 'owned' };
  }

  const existing = await db
    .prepare(
      `SELECT method, route_key, status, response_json, created_at
       FROM idempotency_records
       WHERE user_id = ? AND idempotency_key = ?`,
    )
    .bind(userId, key)
    .first<IdempotencyRow>();

  if (!existing) {
    return { kind: 'owned' };
  }

  if (existing.method !== method || existing.route_key !== routeKey) {
    return {
      kind: 'conflict',
      status: 409,
      body: conflictBody(
        'Idempotency-Key was already used for a different request',
        ErrorCodes.IDEMPOTENCY_KEY_REUSED,
      ),
    };
  }

  if (existing.status === 0 || !existing.response_json) {
    return {
      kind: 'conflict',
      status: 409,
      body: conflictBody(
        'A request with this Idempotency-Key is still in progress',
        ErrorCodes.IDEMPOTENCY_IN_PROGRESS,
      ),
    };
  }

  try {
    return {
      kind: 'replay',
      status: existing.status,
      body: JSON.parse(existing.response_json) as unknown,
    };
  } catch {
    return {
      kind: 'conflict',
      status: 409,
      body: conflictBody(
        'Stored idempotent response is unreadable',
        ErrorCodes.ERROR,
      ),
    };
  }
}

export async function finishIdempotency(
  db: D1Database,
  userId: string,
  key: string,
  status: number,
  body: unknown,
): Promise<void> {
  await db
    .prepare(
      `UPDATE idempotency_records
       SET status = ?, response_json = ?
       WHERE user_id = ? AND idempotency_key = ?`,
    )
    .bind(status, JSON.stringify(body), userId, key)
    .run();
}

export async function abortIdempotency(
  db: D1Database,
  userId: string,
  key: string,
): Promise<void> {
  await db
    .prepare(
      `DELETE FROM idempotency_records
       WHERE user_id = ? AND idempotency_key = ? AND status = 0`,
    )
    .bind(userId, key)
    .run();
}
