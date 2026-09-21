import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkAndIncrementImageUpload,
  FREE_IMAGE_UPLOAD_LIMIT,
  QuotaExceededError,
  startOfUtcMonth,
} from './quotas';

type QuotaState = {
  image_uploads: number;
  image_period_start: number | null;
};

function createFakeDb(initial?: QuotaState) {
  const state: { row: QuotaState | null } = {
    row: initial
      ? {
          image_uploads: initial.image_uploads,
          image_period_start: initial.image_period_start,
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
          } as T;
        },
        async run() {
          if (isInsert) {
            state.row = {
              image_uploads: 0,
              image_period_start: bound[3] as number,
            };
            return { success: true };
          }
          if (isUpdate) {
            state.row = {
              image_uploads: bound[0] as number,
              image_period_start: bound[1] as number,
            };
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
});
