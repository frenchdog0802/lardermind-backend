import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAndIncrementAiMessage,
  checkAndIncrementImageUpload,
  FREE_AI_MESSAGES_PER_DAY,
  FREE_IMAGE_UPLOAD_LIMIT,
  PRO_AI_MESSAGES_PER_DAY,
  QuotaExceededError,
  startOfUtcDay,
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

  it('allows 20 free messages then forbids the 21st', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: 0,
      ai_period_start: startOfUtcDay(Math.floor(Date.now() / 1000)),
    });

    for (let i = 0; i < FREE_AI_MESSAGES_PER_DAY; i++) {
      await checkAndIncrementAiMessage(db, 'u1');
    }
    expect(state.row?.ai_message_sent).toBe(20);

    await expect(checkAndIncrementAiMessage(db, 'u1')).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
  });

  it('resets counter on day rollover', async () => {
    const oldPeriod = Date.UTC(2026, 8, 16) / 1000;
    const { db, state } = createFakeDb({
      ai_message_sent: 20,
      ai_period_start: oldPeriod,
    });

    await checkAndIncrementAiMessage(db, 'u1');
    expect(state.row?.ai_message_sent).toBe(1);
    expect(state.row?.ai_period_start).toBe(
      startOfUtcDay(Math.floor(Date.now() / 1000)),
    );
  });

  it('allows 200 for pro', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: PRO_AI_MESSAGES_PER_DAY - 1,
      ai_period_start: startOfUtcDay(Math.floor(Date.now() / 1000)),
    });

    await checkAndIncrementAiMessage(db, 'u1', { isPro: true });
    expect(state.row?.ai_message_sent).toBe(PRO_AI_MESSAGES_PER_DAY);

    await expect(
      checkAndIncrementAiMessage(db, 'u1', { isPro: true }),
    ).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('skips cap for admin', async () => {
    const { db, state } = createFakeDb({
      ai_message_sent: 500,
      ai_period_start: startOfUtcDay(Math.floor(Date.now() / 1000)),
    });

    await checkAndIncrementAiMessage(db, 'u1', { isAdmin: true });
    expect(state.row?.ai_message_sent).toBe(501);
  });
});
