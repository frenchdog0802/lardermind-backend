import { describe, expect, it, vi } from 'vitest';
import {
  getAiUsageForStatus,
  getImageUsageForStatus,
  mergeGuestUsageIntoRealUser,
  startOfUtcDay,
  startOfUtcIsoWeek,
  startOfUtcMonth,
} from './quotas';

type QuotaRow = {
  id: string;
  user_id: string;
  ai_message_sent: number;
  ai_period_start: number | null;
  image_uploads: number;
  image_period_start: number | null;
};

function createMultiUserQuotaDb(rows: QuotaRow[]) {
  const byUser = new Map(rows.map((r) => [r.user_id, { ...r }]));

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (sql.includes('FROM usage_quotas') && sql.includes('SELECT')) {
            const userId = bound[0] as string;
            const row = byUser.get(userId);
            return (row ?? null) as T;
          }
          return null;
        },
        async run() {
          if (sql.includes('DELETE FROM usage_quotas')) {
            byUser.delete(bound[0] as string);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE usage_quotas') && sql.includes('SET user_id')) {
            const [
              newUserId,
              aiSent,
              aiPeriod,
              images,
              imagePeriod,
              ,
              oldUserId,
            ] = bound as [
              string,
              number,
              number,
              number,
              number,
              number,
              string,
            ];
            const existing = byUser.get(oldUserId);
            if (existing) {
              byUser.delete(oldUserId);
              byUser.set(newUserId, {
                ...existing,
                user_id: newUserId,
                ai_message_sent: aiSent,
                ai_period_start: aiPeriod,
                image_uploads: images,
                image_period_start: imagePeriod,
              });
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE usage_quotas')) {
            const userId = bound[5] as string;
            const existing = byUser.get(userId);
            if (existing) {
              byUser.set(userId, {
                ...existing,
                ai_message_sent: bound[0] as number,
                ai_period_start: bound[1] as number,
                image_uploads: bound[2] as number,
                image_period_start: bound[3] as number,
              });
            }
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO usage_quotas')) {
            const userId = bound[1] as string;
            byUser.set(userId, {
              id: bound[0] as string,
              user_id: userId,
              ai_message_sent: bound[2] as number,
              ai_period_start: bound[3] as number,
              image_uploads: bound[4] as number,
              image_period_start: bound[5] as number,
            });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, byUser };
}

describe('mergeGuestUsageIntoRealUser', () => {
  it('sums same-day AI usage from guest into real and drops guest row', async () => {
    const now = Math.floor(Date.UTC(2026, 9, 24, 18, 0, 0) / 1000);
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const dayStart = startOfUtcDay(now);
    const monthStart = startOfUtcMonth(now);

    const { db, byUser } = createMultiUserQuotaDb([
      {
        id: 'qg',
        user_id: 'guest',
        ai_message_sent: 3,
        ai_period_start: dayStart,
        image_uploads: 2,
        image_period_start: monthStart,
      },
      {
        id: 'qr',
        user_id: 'real',
        ai_message_sent: 1,
        ai_period_start: dayStart,
        image_uploads: 0,
        image_period_start: monthStart,
      },
    ]);

    await mergeGuestUsageIntoRealUser(db, 'guest', 'real');

    expect(byUser.has('guest')).toBe(false);
    const real = byUser.get('real');
    expect(real?.ai_message_sent).toBe(4);
    expect(real?.image_uploads).toBe(2);

    const ai = await getAiUsageForStatus(db, 'real');
    expect(ai.used).toBe(4);
    const images = await getImageUsageForStatus(db, 'real');
    expect(images.used).toBe(2);

    vi.restoreAllMocks();
  });

  it('sums guest daily usage into the real user weekly counter', async () => {
    const now = Math.floor(Date.UTC(2026, 9, 24, 18, 0, 0) / 1000); // Saturday
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const weekStart = startOfUtcIsoWeek(now);
    const { db, byUser } = createMultiUserQuotaDb([
      { id: 'qg', user_id: 'guest', ai_message_sent: 3, ai_period_start: startOfUtcDay(now), image_uploads: 0, image_period_start: null },
      { id: 'qr', user_id: 'real', ai_message_sent: 10, ai_period_start: weekStart, image_uploads: 0, image_period_start: null },
    ]);
    await mergeGuestUsageIntoRealUser(db, 'guest', 'real');
    expect(byUser.get('real')?.ai_message_sent).toBe(13);
    expect(byUser.get('real')?.ai_period_start).toBe(weekStart);
    vi.restoreAllMocks();
  });

  it('ignores guest AI count from a previous UTC day', async () => {
    const now = Math.floor(Date.UTC(2026, 9, 24, 12, 0, 0) / 1000);
    vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    const dayStart = startOfUtcDay(now);
    const yesterday = dayStart - 86400;

    const { db, byUser } = createMultiUserQuotaDb([
      {
        id: 'qg',
        user_id: 'guest',
        ai_message_sent: 5,
        ai_period_start: yesterday,
        image_uploads: 0,
        image_period_start: null,
      },
      {
        id: 'qr',
        user_id: 'real',
        ai_message_sent: 0,
        ai_period_start: dayStart,
        image_uploads: 0,
        image_period_start: null,
      },
    ]);

    await mergeGuestUsageIntoRealUser(db, 'guest', 'real');

    expect(byUser.get('real')?.ai_message_sent).toBe(0);
    const ai = await getAiUsageForStatus(db, 'real');
    expect(ai.used).toBe(0);

    vi.restoreAllMocks();
  });
});
