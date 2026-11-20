import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAndIncrementAiMessage,
  checkAndIncrementImageUpload,
  FREE_AI_MESSAGES_PER_WEEK,
  FREE_IMAGE_UPLOAD_LIMIT,
  GUEST_AI_MESSAGES_PER_DAY,
  PRO_AI_MESSAGES_PER_WEEK,
  QuotaExceededError,
  startOfUtcDay,
  startOfUtcIsoWeek,
  aiPeriodResetsAt,
  getAiUsageForStatus,
  startOfUtcMonth,
} from './quotas';

type QuotaState = {
  image_uploads: number;
  image_period_start: number | null;
  ai_message_sent: number;
  ai_period_start: number | null;
};

function createFakeDb(initial?: Partial<QuotaState>) {
  const state: { row: QuotaState | null } = {
    row: initial
      ? {
          image_uploads: initial.image_uploads ?? 0,
          image_period_start: initial.image_period_start ?? null,
          ai_message_sent: initial.ai_message_sent ?? 0,
          ai_period_start: initial.ai_period_start ?? null,
        }
      : null,
  };

  const db = {
    prepare(sql: string) {
      const isSelect = sql.includes('SELECT');
      const isInsert = sql.includes('INSERT');
      const isUpdate = sql.includes('UPDATE');
      let bound: unknown[] = [];

      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (!isSelect) return null;
          if (!state.row) return null;
          return {
            id: 'q1',
            user_id: 'u1',
            image_uploads: state.row.image_uploads,
            image_period_start: state.row.image_period_start,
            ai_message_sent: state.row.ai_message_sent,
            ai_period_start: state.row.ai_period_start,
          } as T;
        },
        async run() {
          if (isInsert) {
            state.row = {
              image_uploads: 0,
              image_period_start: (bound[3] as number) ?? null,
              ai_message_sent: 0,
              ai_period_start: (bound[2] as number) ?? null,
            };
            return { success: true };
          }
          if (isUpdate) {
            if (sql.includes('image_uploads')) {
              state.row = {
                image_uploads: bound[0] as number,
                image_period_start: bound[1] as number,
                ai_message_sent: state.row?.ai_message_sent ?? 0,
                ai_period_start: state.row?.ai_period_start ?? null,
              };
            } else if (sql.includes('ai_message_sent')) {
              state.row = {
                image_uploads: state.row?.image_uploads ?? 0,
                image_period_start: state.row?.image_period_start ?? null,
                ai_message_sent: bound[0] as number,
                ai_period_start: bound[1] as number,
              };
            }
            return { success: true };
          }
          return { success: true };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, state };
}

describe('startOfUtcMonth', () => {
  it('returns UTC month boundary', () => {
    const mid = Date.UTC(2026, 8, 17, 15, 0, 0) / 1000;
    expect(startOfUtcMonth(mid)).toBe(Date.UTC(2026, 8, 1) / 1000);
  });
});

describe('startOfUtcDay', () => {
  it('returns UTC day boundary', () => {
    const mid = Date.UTC(2026, 8, 17, 15, 30, 0) / 1000;
    expect(startOfUtcDay(mid)).toBe(Date.UTC(2026, 8, 17) / 1000);
  });
});

describe('startOfUtcIsoWeek', () => {
  it('returns Monday 00:00 UTC for a mid-week time', () => {
    const wed = Date.UTC(2026, 8, 16, 15, 0, 0) / 1000; // Wed 2026-09-16
    expect(startOfUtcIsoWeek(wed)).toBe(Date.UTC(2026, 8, 14) / 1000);
  });
  it('maps Monday 00:00 to itself and Sunday 23:59 to the same week', () => {
    const mon = Date.UTC(2026, 8, 14) / 1000;
    expect(startOfUtcIsoWeek(mon)).toBe(mon);
    expect(startOfUtcIsoWeek(Date.UTC(2026, 8, 20, 23, 59, 59) / 1000)).toBe(mon);
    expect(startOfUtcIsoWeek(Date.UTC(2026, 8, 21) / 1000)).toBe(mon + 7 * 86400);
  });
  it('resetsAt is next Monday 00:00 UTC for week and next midnight for day', () => {
    const thu = Date.UTC(2026, 8, 17, 12, 0, 0) / 1000;
    expect(aiPeriodResetsAt('week', thu)).toBe(Date.UTC(2026, 8, 21) / 1000);
    expect(aiPeriodResetsAt('day', thu)).toBe(Date.UTC(2026, 8, 18) / 1000);
  });
});

describe('checkAndIncrementImageUpload', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
  });

  it('allows 10 free uploads then forbids the 11th', async () => {
    const { db, state } = createFakeDb({
      image_uploads: 0,
      image_period_start: startOfUtcMonth(Math.floor(Date.now() / 1000)),
    });

    for (let i = 0; i < FREE_IMAGE_UPLOAD_LIMIT; i++) {
      await checkAndIncrementImageUpload(db, 'u1');
    }
    expect(state.row?.image_uploads).toBe(10);

    await expect(checkAndIncrementImageUpload(db, 'u1')).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('resets counter on month rollover', async () => {
    const oldPeriod = Date.UTC(2026, 7, 1) / 1000; // August
    const { db, state } = createFakeDb({
      image_uploads: 10,
      image_period_start: oldPeriod,
    });

    await checkAndIncrementImageUpload(db, 'u1');
    expect(state.row?.image_uploads).toBe(1);
    expect(state.row?.image_period_start).toBe(
      startOfUtcMonth(Math.floor(Date.now() / 1000)),
    );
  });

  it('skips cap for admin', async () => {
    const { db, state } = createFakeDb({
      image_uploads: 50,
      image_period_start: startOfUtcMonth(Math.floor(Date.now() / 1000)),
    });

    await checkAndIncrementImageUpload(db, 'u1', { isAdmin: true });
    expect(state.row?.image_uploads).toBe(51);
  });

  it('skips cap for pro', async () => {
    const { db, state } = createFakeDb({
      image_uploads: 50,
      image_period_start: startOfUtcMonth(Math.floor(Date.now() / 1000)),
    });

    await checkAndIncrementImageUpload(db, 'u1', { isPro: true });
    expect(state.row?.image_uploads).toBe(51);
  });
});

describe('checkAndIncrementAiMessage', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
  });

  const nowSec = () => Math.floor(Date.now() / 1000);

  it('allows 50 free messages per ISO week then forbids the 51st', async () => {
    expect(FREE_AI_MESSAGES_PER_WEEK).toBe(50);
    const { db, state } = createFakeDb({
      ai_message_sent: 0,
      ai_period_start: startOfUtcIsoWeek(nowSec()),
    });

    for (let i = 0; i < FREE_AI_MESSAGES_PER_WEEK; i++) {
      await checkAndIncrementAiMessage(db, 'u1');
    }
    expect(state.row?.ai_message_sent).toBe(50);

    await expect(checkAndIncrementAiMessage(db, 'u1')).rejects.toThrow(
      'AI message quota exceeded for this week',
    );
  });

  it('does not reset free counter at UTC midnight mid-week', async () => {
    // 2026-09-17 is a Thursday; usage stamped Monday of this week still counts.
    const { db } = createFakeDb({
      ai_message_sent: 50,
      ai_period_start: startOfUtcIsoWeek(nowSec()),
    });
    vi.setSystemTime(new Date('2026-09-18T00:00:01Z'));
    await expect(checkAndIncrementAiMessage(db, 'u1')).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('counts a legacy day-stamped row from earlier this week toward the week', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: 49,
      ai_period_start: startOfUtcDay(nowSec()), // legacy daily stamp, inside this week
    });
    await checkAndIncrementAiMessage(db, 'u1');
    expect(state.row?.ai_message_sent).toBe(50);
    expect(state.row?.ai_period_start).toBe(startOfUtcIsoWeek(nowSec()));
    await expect(checkAndIncrementAiMessage(db, 'u1')).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('resets free counter on ISO week rollover (Monday 00:00 UTC)', async () => {
    const lastWeek = startOfUtcIsoWeek(nowSec()) - 7 * 86400;
    const { db, state } = createFakeDb({
      ai_message_sent: 50,
      ai_period_start: lastWeek,
    });

    await checkAndIncrementAiMessage(db, 'u1');
    expect(state.row?.ai_message_sent).toBe(1);
    expect(state.row?.ai_period_start).toBe(startOfUtcIsoWeek(nowSec()));
  });

  it('allows PRO_AI_MESSAGES_PER_WEEK (300) for pro', async () => {
    expect(PRO_AI_MESSAGES_PER_WEEK).toBe(300);
    const { db, state } = createFakeDb({
      ai_message_sent: PRO_AI_MESSAGES_PER_WEEK - 1,
      ai_period_start: startOfUtcIsoWeek(nowSec()),
    });

    await checkAndIncrementAiMessage(db, 'u1', { isPro: true });
    expect(state.row?.ai_message_sent).toBe(PRO_AI_MESSAGES_PER_WEEK);

    await expect(
      checkAndIncrementAiMessage(db, 'u1', { isPro: true }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('skips cap for admin', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: 500,
      ai_period_start: startOfUtcIsoWeek(Math.floor(Date.now() / 1000)),
    });

    await checkAndIncrementAiMessage(db, 'u1', { isAdmin: true });
    expect(state.row?.ai_message_sent).toBe(501);
  });

  it('allows 5 guest messages then forbids the 6th', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: 0,
      ai_period_start: startOfUtcDay(Math.floor(Date.now() / 1000)),
    });

    for (let i = 0; i < GUEST_AI_MESSAGES_PER_DAY; i++) {
      await checkAndIncrementAiMessage(db, 'g1', { isGuest: true });
    }
    expect(state.row?.ai_message_sent).toBe(GUEST_AI_MESSAGES_PER_DAY);

    await expect(
      checkAndIncrementAiMessage(db, 'g1', { isGuest: true }),
    ).rejects.toThrow('AI message quota exceeded for today');
  });

  it('guest counter still resets daily, not weekly', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: 5,
      ai_period_start: startOfUtcDay(Math.floor(Date.now() / 1000)) - 86400,
    });
    await checkAndIncrementAiMessage(db, 'g1', { isGuest: true });
    expect(state.row?.ai_message_sent).toBe(1);
  });
});

describe('getAiUsageForStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z')); // Thursday
  });

  it('reports weekly period + resetsAt (next Monday) for non-guests', async () => {
    const { db } = createFakeDb({
      ai_message_sent: 12,
      ai_period_start: startOfUtcIsoWeek(Math.floor(Date.now() / 1000)),
    });
    const r = await getAiUsageForStatus(db, 'u1');
    expect(r.used).toBe(12);
    expect(r.period).toBe('week');
    expect(r.resetsAt).toBe(Date.UTC(2026, 8, 21) / 1000);
  });

  it('reports 0 used for a stale previous-week row', async () => {
    const { db } = createFakeDb({
      ai_message_sent: 40,
      ai_period_start: Date.UTC(2026, 8, 7) / 1000,
    });
    expect((await getAiUsageForStatus(db, 'u1')).used).toBe(0);
  });
});
