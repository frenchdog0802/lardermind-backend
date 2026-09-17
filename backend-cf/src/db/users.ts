import type { Env } from '../env';
import { nowUnixSeconds } from '../lib/time';
import { authenticate, encryptPassword, makeSalt } from '../lib/password';

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
  picture: string | null;
  created_at: number | null;
  updated_at: number | null;
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
    .prepare('SELECT * FROM users WHERE email = ? LIMIT 1')
    .bind(email)
    .first<UserRow>();
}

export async function findUserById(
  db: D1Database,
  id: string,
): Promise<UserRow | null> {
  return db.prepare('SELECT * FROM users WHERE id = ? LIMIT 1').bind(id).first<UserRow>();
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
  const salt = makeSalt();
  const hashedPassword = await encryptPassword(input.password, salt);
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
      salt,
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
  if (!user) throw new Error('User not found');
  if (
    !user.salt ||
    !user.hashed_password ||
    !(await authenticate(input.password, user.salt, user.hashed_password))
  ) {
    throw new Error("Email and password don't match.");
  }
  return user;
}
