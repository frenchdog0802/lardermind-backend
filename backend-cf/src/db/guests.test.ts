import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GUEST_CHAT_PER_IP_PER_DAY,
  GUEST_MINT_PER_IP_PER_DAY,
} from '../lib/entitlement';
import {
  assertGuestChatIpAllowed,
  assertGuestMintAllowed,
  hashIp,
  isGuestExpired,
  isGuestUserRow,
} from './guests';
import type { UserRow } from './users';

type RateState = {
  id: string;
  ip_hash: string;
  bucket_day: string;
  mint_count: number;
  chat_count: number;
};

function createRateLimitDb(initial?: Partial<RateState>) {
  const state: { row: RateState | null } = {
    row: initial
      ? {
          id: initial.id ?? 'r1',
          ip_hash: initial.ip_hash ?? 'hash',
          bucket_day: initial.bucket_day ?? '2026-09-17',
          mint_count: initial.mint_count ?? 0,
          chat_count: initial.chat_count ?? 0,
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
          return state.row as T;
        },
        async run() {
          if (isInsert) {
            state.row = {
              id: bound[0] as string,
              ip_hash: bound[1] as string,
              bucket_day: bound[2] as string,
              mint_count: 0,
              chat_count: 0,
            };
          }
          if (isUpdate && state.row) {
            if (sql.includes('mint_count')) {
              state.row = {
                ...state.row,
                mint_count: state.row.mint_count + 1,
              };
            }
            if (sql.includes('chat_count')) {
              state.row = {
                ...state.row,
                chat_count: state.row.chat_count + 1,
              };
            }
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, state };
}

describe('hashIp', () => {
  it('returns stable sha-256 hex', async () => {
    const a = await hashIp('1.2.3.4');
    const b = await hashIp('1.2.3.4');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe('isGuestUserRow / isGuestExpired', () => {
  it('detects guest flag', () => {
    expect(
      isGuestUserRow({ is_guest: 1 } as unknown as UserRow),
    ).toBe(true);
    expect(
      isGuestUserRow({ is_guest: 0 } as unknown as UserRow),
    ).toBe(false);
  });

  it('expires when expires_at is in the past', () => {
    const now = Math.floor(Date.now() / 1000);
    expect(
      isGuestExpired({ expires_at: now - 10 } as unknown as UserRow),
    ).toBe(true);
    expect(
      isGuestExpired({ expires_at: now + 3600 } as unknown as UserRow),
    ).toBe(false);
    expect(
      isGuestExpired({ expires_at: null } as unknown as UserRow),
    ).toBe(false);
  });
});

describe('assertGuestMintAllowed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
  });

  it('allows up to GUEST_MINT_PER_IP_PER_DAY then throws', async () => {
    const { db, state } = createRateLimitDb({
      mint_count: GUEST_MINT_PER_IP_PER_DAY - 1,
      chat_count: 0,
      bucket_day: '2026-09-17',
    });

    await assertGuestMintAllowed(db, '9.9.9.9');
    expect(state.row?.mint_count).toBe(GUEST_MINT_PER_IP_PER_DAY);

    await expect(assertGuestMintAllowed(db, '9.9.9.9')).rejects.toThrow(
      /rate limit/i,
    );
  });
});

describe('assertGuestChatIpAllowed', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-17T12:00:00Z'));
  });

  it('allows up to GUEST_CHAT_PER_IP_PER_DAY then throws', async () => {
    const { db, state } = createRateLimitDb({
      mint_count: 0,
      chat_count: GUEST_CHAT_PER_IP_PER_DAY - 1,
      bucket_day: '2026-09-17',
    });

    await assertGuestChatIpAllowed(db, '8.8.8.8');
    expect(state.row?.chat_count).toBe(GUEST_CHAT_PER_IP_PER_DAY);

    await expect(assertGuestChatIpAllowed(db, '8.8.8.8')).rejects.toThrow(
      /rate limit/i,
    );
  });
});
