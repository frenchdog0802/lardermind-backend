import { hashIp } from './guests';
import { nowUnixSeconds } from '../lib/time';

/** Fixed window for auth routes. */
export const AUTH_WINDOW_SECONDS = 15 * 60;

export const AUTH_LIMITS = {
  signinIp: 30,
  signinEmail: 20,
  signupIp: 10,
  googleIp: 30,
} as const;

export class AuthRateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super('Too many attempts. Try again later.');
    this.name = 'AuthRateLimitError';
    this.retryAfterSeconds = Math.max(1, retryAfterSeconds);
  }
}

export function signinEmailSubject(email: string): string {
  return `signin:email:${email.trim().toLowerCase()}`;
}

export function signinIpSubject(ip: string): string {
  return `signin:ip:${ip.trim() || 'unknown'}`;
}

export function signupIpSubject(ip: string): string {
  return `signup:ip:${ip.trim() || 'unknown'}`;
}

export function googleIpSubject(ip: string): string {
  return `google:ip:${ip.trim() || 'unknown'}`;
}

/**
 * Increment the fixed-window counter and throw when it passes `limit`.
 * `now` is injectable for tests.
 */
export async function assertAuthAllowed(
  db: D1Database,
  subject: string,
  limit: number,
  windowSeconds = AUTH_WINDOW_SECONDS,
  now = nowUnixSeconds(),
): Promise<void> {
  const bucket = Math.floor(now / windowSeconds) * windowSeconds;
  const subjectHash = await hashIp(subject);
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO auth_rate_limits (id, subject_hash, bucket_start, attempts, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(subject_hash, bucket_start) DO UPDATE SET
         attempts = attempts + 1,
         updated_at = excluded.updated_at`,
    )
    .bind(id, subjectHash, bucket, now)
    .run();

  const row = await db
    .prepare(
      `SELECT attempts FROM auth_rate_limits
       WHERE subject_hash = ? AND bucket_start = ?`,
    )
    .bind(subjectHash, bucket)
    .first<{ attempts: number }>();

  const attempts = row?.attempts ?? 0;
  if (attempts > limit) {
    throw new AuthRateLimitError(bucket + windowSeconds - now);
  }
}
