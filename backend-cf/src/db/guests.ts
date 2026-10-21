import { nowUnixSeconds } from '../lib/time';
import {
  GUEST_CHAT_PER_IP_PER_DAY,
  GUEST_MINT_PER_IP_PER_DAY,
  GUEST_TTL_SECONDS,
} from '../lib/entitlement';
import type { UserRow } from './users';

export async function hashIp(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip.trim() || 'unknown');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function utcDayKey(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toISOString().slice(0, 10);
}

type RateRow = {
  id: string;
  mint_count: number;
  chat_count: number;
};

async function getOrCreateRateRow(
  db: D1Database,
  ipHash: string,
  bucketDay: string,
  now: number,
): Promise<RateRow> {
  const existing = await db
    .prepare(
      `SELECT id, mint_count, chat_count FROM guest_rate_limits
       WHERE ip_hash = ? AND bucket_day = ? LIMIT 1`,
    )
    .bind(ipHash, bucketDay)
    .first<RateRow>();
  if (existing) return existing;

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO guest_rate_limits (id, ip_hash, bucket_day, mint_count, chat_count, updated_at)
       VALUES (?, ?, ?, 0, 0, ?)`,
    )
    .bind(id, ipHash, bucketDay, now)
    .run();
  return { id, mint_count: 0, chat_count: 0 };
}

export async function assertGuestMintAllowed(
  db: D1Database,
  ip: string,
): Promise<void> {
  const now = nowUnixSeconds();
  const ipHash = await hashIp(ip);
  const bucketDay = utcDayKey(now);
  const row = await getOrCreateRateRow(db, ipHash, bucketDay, now);
  if (row.mint_count >= GUEST_MINT_PER_IP_PER_DAY) {
    throw new Error('Guest mint rate limit exceeded');
  }
  await db
    .prepare(
      `UPDATE guest_rate_limits SET mint_count = mint_count + 1, updated_at = ? WHERE id = ?`,
    )
    .bind(now, row.id)
    .run();
}

export async function assertGuestChatIpAllowed(
  db: D1Database,
  ip: string,
): Promise<void> {
  const now = nowUnixSeconds();
  const ipHash = await hashIp(ip);
  const bucketDay = utcDayKey(now);
  const row = await getOrCreateRateRow(db, ipHash, bucketDay, now);
  if (row.chat_count >= GUEST_CHAT_PER_IP_PER_DAY) {
    throw new Error('Guest chat rate limit exceeded');
  }
  await db
    .prepare(
      `UPDATE guest_rate_limits SET chat_count = chat_count + 1, updated_at = ? WHERE id = ?`,
    )
    .bind(now, row.id)
    .run();
}

export async function createGuestUser(db: D1Database): Promise<UserRow> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  const expiresAt = now + GUEST_TTL_SECONDS;
  const email = `guest-${id}@guest.lardermind.local`;

  await db.batch([
    db.prepare(
      `INSERT INTO users (
         id, first_name, last_name, name, email, hashed_password, salt, role,
         google_id, picture, created_at, updated_at, is_guest, expires_at
       ) VALUES (?, 'Guest', '', 'Guest', ?, NULL, NULL, 'guest', NULL, NULL, ?, ?, 1, ?)`,
    ).bind(id, email, now, now, expiresAt),
    db.prepare(
      `INSERT INTO usage_quotas (id, user_id, ai_message_sent, ai_period_start, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), id, now, now, now),
  ]);

  const user = await db
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(id)
    .first<UserRow>();
  if (!user) throw new Error('Failed to create guest user');
  return user;
}

export function isGuestUserRow(user: UserRow | null | undefined): boolean {
  if (!user) return false;
  return Number((user as UserRow & { is_guest?: number }).is_guest) === 1;
}

export function isGuestExpired(user: UserRow): boolean {
  const expiresAt = (user as UserRow & { expires_at?: number | null }).expires_at;
  if (expiresAt == null) return false;
  return expiresAt < nowUnixSeconds();
}

/** Reassign guest kitchen data to a real user, then delete the guest. */
export async function claimGuestKitchen(
  db: D1Database,
  guestUserId: string,
  realUserId: string,
): Promise<void> {
  if (guestUserId === realUserId) {
    throw new Error('Cannot claim into the same user');
  }

  const guest = await db
    .prepare('SELECT * FROM users WHERE id = ? LIMIT 1')
    .bind(guestUserId)
    .first<UserRow>();
  if (!guest || !isGuestUserRow(guest)) {
    throw new Error('Guest not found');
  }
  if (isGuestExpired(guest)) {
    throw new Error('Guest session expired');
  }

  const tables = [
    'pantry_items',
    'recipes',
    'shopping_list_items',
    'meal_plans',
    'folders',
    'unit_conversions',
    'chat_sessions',
    'ai_messages',
  ] as const;

  const stmts = tables.map((table) =>
    db
      .prepare(`UPDATE ${table} SET user_id = ? WHERE user_id = ?`)
      .bind(realUserId, guestUserId),
  );

  // Unique prefs / quotas: drop guest copy if real already has one
  const realPrefs = await db
    .prepare('SELECT id FROM user_preferences WHERE user_id = ? LIMIT 1')
    .bind(realUserId)
    .first();
  if (realPrefs) {
    stmts.push(
      db
        .prepare('DELETE FROM user_preferences WHERE user_id = ?')
        .bind(guestUserId),
    );
  } else {
    stmts.push(
      db
        .prepare('UPDATE user_preferences SET user_id = ? WHERE user_id = ?')
        .bind(realUserId, guestUserId),
    );
  }

  stmts.push(
    db.prepare('DELETE FROM usage_quotas WHERE user_id = ?').bind(guestUserId),
  );
  stmts.push(db.prepare('DELETE FROM users WHERE id = ?').bind(guestUserId));

  await db.batch(stmts);
}

export async function purgeExpiredGuests(db: D1Database): Promise<number> {
  const now = nowUnixSeconds();
  const result = await db
    .prepare(
      `DELETE FROM users WHERE is_guest = 1 AND expires_at IS NOT NULL AND expires_at < ?`,
    )
    .bind(now)
    .run();
  return result.meta.changes ?? 0;
}
