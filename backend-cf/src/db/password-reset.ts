import { nowUnixSeconds } from '../lib/time';

/** Reset links are valid for one hour. */
export const PASSWORD_RESET_TTL_SECONDS = 60 * 60;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** 256-bit random token, hex encoded (URL safe). Only its hash is persisted. */
export function generateResetToken(): string {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
}

export async function hashResetToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToHex(new Uint8Array(digest));
}

export function isWellFormedResetToken(token: string): boolean {
  return /^[0-9a-f]{64}$/.test(token);
}

/**
 * Create a new token for `userId`, invalidating any earlier unused tokens so only the
 * most recent email link works. Returns the raw token (for the email link only).
 */
export async function createPasswordResetToken(
  db: D1Database,
  userId: string,
  now = nowUnixSeconds(),
): Promise<{ token: string; expiresAt: number }> {
  const token = generateResetToken();
  const tokenHash = await hashResetToken(token);
  const expiresAt = now + PASSWORD_RESET_TTL_SECONDS;
  await db.batch([
    db
      .prepare(
        `UPDATE password_reset_tokens SET used_at = ?
         WHERE user_id = ? AND used_at IS NULL`,
      )
      .bind(now, userId),
    db
      .prepare(
        `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, used_at, created_at)
         VALUES (?, ?, ?, ?, NULL, ?)`,
      )
      .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, now),
  ]);
  return { token, expiresAt };
}

/**
 * Atomically mark a token used. Returns the owning user id, or null when the token is
 * unknown, already used, or expired. A second call with the same token always returns null.
 */
export async function consumePasswordResetToken(
  db: D1Database,
  token: string,
  now = nowUnixSeconds(),
): Promise<string | null> {
  if (!isWellFormedResetToken(token)) return null;
  const tokenHash = await hashResetToken(token);
  const row = await db
    .prepare(
      `UPDATE password_reset_tokens SET used_at = ?
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?
       RETURNING user_id`,
    )
    .bind(now, tokenHash, now)
    .first<{ user_id: string }>();
  return row?.user_id ?? null;
}

/** Set a new password hash and burn every other outstanding token for the user. */
export async function setUserPasswordHash(
  db: D1Database,
  userId: string,
  hashedPassword: string,
  now = nowUnixSeconds(),
): Promise<void> {
  await db.batch([
    db
      .prepare(`UPDATE users SET hashed_password = ?, salt = NULL, updated_at = ? WHERE id = ?`)
      .bind(hashedPassword, now, userId),
    db
      .prepare(
        `UPDATE password_reset_tokens SET used_at = ?
         WHERE user_id = ? AND used_at IS NULL`,
      )
      .bind(now, userId),
  ]);
}
