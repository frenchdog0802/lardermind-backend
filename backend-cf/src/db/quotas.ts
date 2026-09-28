import { nowUnixSeconds } from '../lib/time';
import { FREE_TIER, PRO_TIER } from '../lib/entitlement';

export const FREE_IMAGE_UPLOAD_LIMIT = FREE_TIER.imageUploadsPerMonth;
export const FREE_AI_MESSAGES_PER_DAY = FREE_TIER.aiMessagesPerDay;
export const PRO_AI_MESSAGES_PER_DAY = PRO_TIER.aiMessagesPerDay;

export class QuotaExceededError extends Error {
  constructor(message = 'Image upload quota exceeded for this month') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

type ImageQuotaRow = {
  id: string;
  user_id: string;
  image_uploads: number;
  image_period_start: number | null;
};

type AiQuotaRow = {
  id: string;
  user_id: string;
  ai_message_sent: number;
  ai_period_start: number | null;
};

/** Start of the UTC calendar month containing `unixSeconds`. */
export function startOfUtcMonth(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
}

/** Start of the UTC calendar day containing `unixSeconds`. */
export function startOfUtcDay(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000);
}

/**
 * Increment image upload counter. Free users: 10 / UTC calendar month.
 * Pro or admin: unlimited (still increments for usage stats).
 */
export async function checkAndIncrementImageUpload(
  db: D1Database,
  userId: string,
  options: { isPro?: boolean; isAdmin?: boolean } = {},
): Promise<void> {
  const unlimited = Boolean(options.isPro || options.isAdmin);
  const now = nowUnixSeconds();
  const periodStart = startOfUtcMonth(now);

  let row = await db
    .prepare(
      `SELECT id, user_id, image_uploads, image_period_start
       FROM usage_quotas WHERE user_id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<ImageQuotaRow>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO usage_quotas
           (id, user_id, ai_message_sent, ai_period_start, image_uploads, image_period_start, created_at, updated_at)
         VALUES (?, ?, 0, ?, 0, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userId, now, periodStart, now, now)
      .run();
    row = {
      id: '',
      user_id: userId,
      image_uploads: 0,
      image_period_start: periodStart,
    };
  }

  let uploads = row.image_uploads ?? 0;
  const storedPeriod = row.image_period_start;

  if (storedPeriod == null || storedPeriod < periodStart) {
    uploads = 0;
  }

  if (!unlimited && uploads >= FREE_IMAGE_UPLOAD_LIMIT) {
    throw new QuotaExceededError();
  }

  await db
    .prepare(
      `UPDATE usage_quotas
       SET image_uploads = ?,
           image_period_start = ?,
           updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(uploads + 1, periodStart, now, userId)
    .run();
}

/**
 * Increment AI message counter. Free: 20 / UTC day. Pro: 200 / UTC day.
 * Admin: unlimited (still increments for usage stats).
 */
export async function checkAndIncrementAiMessage(
  db: D1Database,
  userId: string,
  options: { isPro?: boolean; isAdmin?: boolean } = {},
): Promise<void> {
  const isAdmin = Boolean(options.isAdmin);
  const isPro = Boolean(options.isPro);
  const limit = isAdmin ? -1 : isPro ? PRO_AI_MESSAGES_PER_DAY : FREE_AI_MESSAGES_PER_DAY;
  const now = nowUnixSeconds();
  const periodStart = startOfUtcDay(now);

  let row = await db
    .prepare(
      `SELECT id, user_id, ai_message_sent, ai_period_start
       FROM usage_quotas WHERE user_id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<AiQuotaRow>();

  if (!row) {
    await db
      .prepare(
        `INSERT INTO usage_quotas
           (id, user_id, ai_message_sent, ai_period_start, image_uploads, image_period_start, created_at, updated_at)
         VALUES (?, ?, 0, ?, 0, ?, ?, ?)`,
      )
      .bind(crypto.randomUUID(), userId, periodStart, periodStart, now, now)
      .run();
    row = {
      id: '',
      user_id: userId,
      ai_message_sent: 0,
      ai_period_start: periodStart,
    };
  }

  let sent = row.ai_message_sent ?? 0;
  const storedPeriod = row.ai_period_start;

  if (storedPeriod == null || storedPeriod < periodStart) {
    sent = 0;
  }

  if (limit >= 0 && sent >= limit) {
    throw new QuotaExceededError('AI message quota exceeded for today');
  }

  await db
    .prepare(
      `UPDATE usage_quotas
       SET ai_message_sent = ?,
           ai_period_start = ?,
           updated_at = ?
       WHERE user_id = ?`,
    )
    .bind(sent + 1, periodStart, now, userId)
    .run();
}

export async function getAiUsageForStatus(
  db: D1Database,
  userId: string,
): Promise<{ used: number; periodStart: number | null }> {
  const now = nowUnixSeconds();
  const periodStart = startOfUtcDay(now);
  const row = await db
    .prepare(
      `SELECT ai_message_sent, ai_period_start FROM usage_quotas WHERE user_id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<{ ai_message_sent: number; ai_period_start: number | null }>();

  if (!row) return { used: 0, periodStart: null };
  if (row.ai_period_start == null || row.ai_period_start < periodStart) {
    return { used: 0, periodStart };
  }
  return { used: row.ai_message_sent ?? 0, periodStart: row.ai_period_start };
}

export async function getImageUsageForStatus(
  db: D1Database,
  userId: string,
): Promise<{ used: number; periodStart: number | null }> {
  const now = nowUnixSeconds();
  const periodStart = startOfUtcMonth(now);
  const row = await db
    .prepare(
      `SELECT image_uploads, image_period_start FROM usage_quotas WHERE user_id = ? LIMIT 1`,
    )
    .bind(userId)
    .first<{ image_uploads: number; image_period_start: number | null }>();

  if (!row) return { used: 0, periodStart: null };
  if (row.image_period_start == null || row.image_period_start < periodStart) {
    return { used: 0, periodStart };
  }
  return { used: row.image_uploads ?? 0, periodStart: row.image_period_start };
}
