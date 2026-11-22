import type { Env } from '../env';
import { nowUnixSeconds } from '../lib/time';
import { hashPassword, verifyPassword } from '../lib/password';
import type { GoogleIdTokenProfile } from '../lib/google-id-token';
import type { AppleIdTokenProfile } from '../lib/apple-id-token';

export type UserRow = {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  email: string;
  hashed_password: string | null;
  salt: string | null;
  role: string;
  google_id: string | null;
  apple_id?: string | null;
  picture: string | null;
  created_at: number | null;
  updated_at: number | null;
  is_guest?: number | null;
  expires_at?: number | null;
  deleted_at?: number | null;
  deleted_email?: string | null;
  deleted_google_id?: string | null;
  deleted_apple_id?: string | null;
};

export type AuthUserDto = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  name: string;
};

export function toAuthUserDto(user: UserRow): AuthUserDto {
  return {
    id: user.id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    name: user.name,
  };
}

export async function findUserByEmail(
  db: D1Database,
  email: string,
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1')
    .bind(email)
    .first<UserRow>();
}

export async function findUserById(
  db: D1Database,
  id: string,
): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ? AND deleted_at IS NULL LIMIT 1').bind(id).first<UserRow>();
}

export async function findUserByGoogleId(
  db: D1Database,
  googleId: string,
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE google_id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(googleId)
    .first<UserRow>();
}

export async function findUserByAppleId(
  db: D1Database,
  appleId: string,
): Promise<UserRow | null> {
  return db
    .prepare('SELECT * FROM users WHERE apple_id = ? AND deleted_at IS NULL LIMIT 1')
    .bind(appleId)
    .first<UserRow>();
}

function namesFromGoogleProfile(profile: GoogleIdTokenProfile): {
  first_name: string;
  last_name: string;
  name: string;
} {
  const given = profile.given_name?.trim();
  const family = profile.family_name?.trim();
  if (given || family) {
    const first_name = given || 'User';
    const last_name = family || '';
    const name = `${first_name} ${last_name}`.trim();
    return { first_name, last_name, name };
  }
  const full = profile.name?.trim() || profile.email.split('@')[0] || 'User';
  const parts = full.split(/\s+/);
  const first_name = parts[0] || 'User';
  const last_name = parts.slice(1).join(' ');
  return { first_name, last_name, name: full };
}

async function randomPasswordHex(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Find by google_id, else link by verified email, else create. */
export async function upsertGoogleUser(
  env: Env,
  profile: GoogleIdTokenProfile,
): Promise<UserRow> {
  const byGoogle = await findUserByGoogleId(env.DB, profile.sub);
  if (byGoogle) {
    if (profile.picture && profile.picture !== byGoogle.picture) {
      const now = nowUnixSeconds();
      await env.DB.prepare(
        'UPDATE users SET picture = ?, updated_at = ? WHERE id = ?',
      )
        .bind(profile.picture, now, byGoogle.id)
        .run();
      return (await findUserById(env.DB, byGoogle.id)) ?? byGoogle;
    }
    return byGoogle;
  }

  const byEmail = await findUserByEmail(env.DB, profile.email);
  if (byEmail) {
    const now = nowUnixSeconds();
    await env.DB.prepare(
      `UPDATE users SET google_id = ?, picture = COALESCE(?, picture), updated_at = ?
       WHERE id = ?`,
    )
      .bind(profile.sub, profile.picture ?? null, now, byEmail.id)
      .run();
    const linked = await findUserById(env.DB, byEmail.id);
    if (!linked) throw new Error('Failed to link Google account');
    return linked;
  }

  const { first_name, last_name, name } = namesFromGoogleProfile(profile);
  const id = crypto.randomUUID();
  const hashedPassword = await hashPassword(await randomPasswordHex());
  const now = nowUnixSeconds();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (
         id, first_name, last_name, name, email, hashed_password, salt, role,
         google_id, picture, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?, ?)`,
    ).bind(
      id,
      first_name,
      last_name,
      name,
      profile.email,
      hashedPassword,
      null,
      profile.sub,
      profile.picture ?? null,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO usage_quotas (id, user_id, ai_message_sent, ai_period_start, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), id, now, now, now),
  ]);

  const created = await findUserById(env.DB, id);
  if (!created) throw new Error('Failed to create Google user');
  return created;
}

export type AppleNameInput = { givenName?: string | null; familyName?: string | null };

function namesFromApple(
  fullName: string | AppleNameInput | null | undefined,
  email: string,
): { first_name: string; last_name: string; name: string } {
  let first = '';
  let last = '';
  if (typeof fullName === 'string') {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    first = parts[0] ?? '';
    last = parts.slice(1).join(' ');
  } else if (fullName) {
    first = fullName.givenName?.trim() ?? '';
    last = fullName.familyName?.trim() ?? '';
  }
  if (!first && !last) {
    // Apple only shares the name on the very first authorization; fall back to the email local part.
    first = email.split('@')[0] || 'User';
  }
  return { first_name: first || 'User', last_name: last, name: `${first} ${last}`.trim() || 'User' };
}

async function applePlaceholderEmail(sub: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sub));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `apple-${hex.slice(0, 24)}@apple.lardermind.local`;
}

/**
 * Find by apple_id (the token `sub`), else link by the token's VERIFIED email, else create.
 * The client-supplied `email` / `fullName` are never used to link to an existing account; they only
 * fill in a brand-new account (Apple sends them on first authorization only).
 */
export async function upsertAppleUser(
  env: Env,
  profile: AppleIdTokenProfile,
  extra: { fullName?: string | AppleNameInput | null; email?: string | null } = {},
): Promise<UserRow> {
  const byApple = await findUserByAppleId(env.DB, profile.sub);
  if (byApple) return byApple;

  const tokenEmail = profile.email;
  if (tokenEmail && profile.email_verified) {
    const byEmail = await findUserByEmail(env.DB, tokenEmail);
    if (byEmail && !byEmail.apple_id) {
      const now = nowUnixSeconds();
      await env.DB.prepare('UPDATE users SET apple_id = ?, updated_at = ? WHERE id = ?')
        .bind(profile.sub, now, byEmail.id)
        .run();
      const linked = await findUserById(env.DB, byEmail.id);
      if (!linked) throw new Error('Failed to link Apple account');
      return linked;
    }
  }

  // New account. Prefer the token email, then the client-provided one, else a placeholder.
  let email = tokenEmail ?? '';
  if (!email && extra.email?.trim()) email = extra.email.trim();
  if (!email || (await findUserByEmail(env.DB, email))) {
    email = await applePlaceholderEmail(profile.sub);
  }
  const { first_name, last_name, name } = namesFromApple(extra.fullName, email);
  const id = crypto.randomUUID();
  const hashedPassword = await hashPassword(await randomPasswordHex());
  const now = nowUnixSeconds();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (
         id, first_name, last_name, name, email, hashed_password, salt, role,
         apple_id, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?, ?)`,
    ).bind(id, first_name, last_name, name, email, hashedPassword, null, profile.sub, now, now),
    env.DB.prepare(
      `INSERT INTO usage_quotas (id, user_id, ai_message_sent, ai_period_start, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), id, now, now, now),
  ]);

  const created = await findUserById(env.DB, id);
  if (!created) throw new Error('Failed to create Apple user');
  return created;
}

export async function createUser(
  env: Env,
  input: { first_name: string; last_name: string; email: string; password: string },
): Promise<UserRow> {
  const existing = await findUserByEmail(env.DB, input.email);
  if (existing) {
    throw new Error('Email is taken');
  }

  const id = crypto.randomUUID();
  const hashedPassword = await hashPassword(input.password);
  const now = nowUnixSeconds();
  const name = `${input.first_name} ${input.last_name}`.trim();

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id, first_name, last_name, name, email, hashed_password, salt, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'user', ?, ?)`,
    ).bind(
      id,
      input.first_name,
      input.last_name,
      name,
      input.email,
      hashedPassword,
      null,
      now,
      now,
    ),
    env.DB.prepare(
      `INSERT INTO usage_quotas (id, user_id, ai_message_sent, ai_period_start, created_at, updated_at)
       VALUES (?, ?, 0, ?, ?, ?)`,
    ).bind(crypto.randomUUID(), id, now, now, now),
  ]);

  const user = await findUserById(env.DB, id);
  if (!user) throw new Error('Failed to create user');
  return user;
}

export async function signInUser(
  env: Env,
  input: { email: string; password: string },
): Promise<UserRow> {
  const user = await findUserByEmail(env.DB, input.email);
  if (!user) {
    await verifyPassword(input.password, await dummyPasswordHash(), null);
    throw new Error('User not found');
  }
  if (Number(user.is_guest) === 1 || user.role === 'guest') {
    throw new Error('Guest accounts cannot sign in with password');
  }
  const check = user.hashed_password
    ? await verifyPassword(input.password, user.hashed_password, user.salt)
    : { ok: false, needsRehash: false };
  if (!check.ok) {
    // Spend a KDF on unknown emails and password-less rows so the fast path is not "no user".
    if (!user.hashed_password) {
      await verifyPassword(input.password, await dummyPasswordHash(), null);
    }
    throw new Error("Email and password don't match.");
  }
  if (check.needsRehash) {
    try {
      const next = await hashPassword(input.password);
      const now = nowUnixSeconds();
      await env.DB.prepare(
        `UPDATE users SET hashed_password = ?, updated_at = ? WHERE id = ?`,
      )
        .bind(next, now, user.id)
        .run();
      user.hashed_password = next;
    } catch (error) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'password_rehash_failed',
          userId: user.id,
          error: error instanceof Error ? error.message : 'rehash failed',
        }),
      );
    }
  }
  return user;
}

let dummyHashCache: Promise<string> | null = null;

function dummyPasswordHash(): Promise<string> {
  dummyHashCache ??= hashPassword('lardermind-dummy-password');
  return dummyHashCache;
}

/**
 * Soft-delete an account: mark `deleted_at`, free the email / google identifier (placeholder
 * email, originals kept in `deleted_*`), drop credentials and burn outstanding reset tokens.
 * Data rows are kept. Returns false when the user is unknown or already deleted.
 */
export async function softDeleteUser(
  db: D1Database,
  userId: string,
  now = nowUnixSeconds(),
): Promise<boolean> {
  const placeholder = `deleted-${userId}@deleted.lardermind.local`;
  const results = await db.batch([
    db
      .prepare(
        `UPDATE users SET deleted_at = ?, deleted_email = email, deleted_google_id = google_id,
           deleted_apple_id = apple_id,
           email = ?, google_id = NULL, apple_id = NULL, hashed_password = NULL, salt = NULL, updated_at = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .bind(now, placeholder, now, userId),
    db
      .prepare(
        `UPDATE password_reset_tokens SET used_at = ?
         WHERE user_id = ? AND used_at IS NULL`,
      )
      .bind(now, userId),
  ]);
  return (results[0]?.meta?.changes ?? 0) > 0;
}
