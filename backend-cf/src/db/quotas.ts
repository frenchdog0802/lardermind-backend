import { nowUnixSeconds } from '../lib/time';

export const FREE_IMAGE_UPLOAD_LIMIT = 10;

export class QuotaExceededError extends Error {
  constructor(message = 'Image upload quota exceeded for this month') {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

type QuotaRow = {
  id: string;
  user_id: string;
  image_uploads: number;
  image_period_start: number | null;
};

/** Start of the UTC calendar month containing `unixSeconds`. */
export function startOfUtcMonth(unixSeconds: number): number {
  const d = new Date(unixSeconds * 1000);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) / 1000);
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
    .first<QuotaRow>();

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
