import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import type { Env } from '../env';

const sessions = new Map<string, Record<string, unknown>>();
const subs = new Map<string, Record<string, unknown>>();

vi.mock('../lib/stripe', async (orig) => {
  const actual = await orig<typeof import('../lib/stripe')>();
  return {
    ...actual,
    getStripe: () => ({
      checkout: { sessions: { retrieve: async (id: string) => sessions.get(id) } },
      subscriptions: { retrieve: async (id: string) => subs.get(id) },
    }),
  };
});

import { confirmCheckoutSession } from './subscription';
import { resolveEntitlement } from '../db/subscriptions';

const USER = 'user-1';

function seedUser(sqlite: import('node:sqlite').DatabaseSync) {
  try {
    sqlite
      .prepare(
        `INSERT INTO users (id, first_name, last_name, name, email, role, created_at, updated_at)
         VALUES (?, 'A', 'B', 'A B', 'a@example.com', 'user', 1, 1)`,
      )
      .run(USER);
  } catch {
    // schema variations: subscriptions has no hard FK requirement in most setups
  }
}

describe('confirmCheckoutSession', () => {
  beforeEach(() => {
    sessions.clear();
    subs.clear();
    subs.set('sub_1', {
      id: 'sub_1',
      customer: 'cus_1',
      status: 'trialing',
      metadata: { userId: USER },
      cancel_at_period_end: false,
      trial_end: 2000000000,
      items: {
        data: [
          {
            price: { id: 'price_m', recurring: { interval: 'month' } },
            current_period_start: 1,
            current_period_end: 2000000000,
          },
        ],
      },
    });
  });

  const env = { STRIPE_SECRET_KEY: 'sk_test', STRIPE_PRICE_MONTHLY: 'price_m' } as Env;

  it('activates a $0 trial checkout (complete + no_payment_required)', async () => {
    const { db, sqlite } = createSqliteD1();
    seedUser(sqlite);
    sessions.set('cs_1', {
      id: 'cs_1',
      mode: 'subscription',
      status: 'complete',
      payment_status: 'no_payment_required',
      client_reference_id: USER,
      subscription: 'sub_1',
    });
    const result = await confirmCheckoutSession({ ...env, DB: db }, USER, 'cs_1');
    expect(result).toEqual({ kind: 'activated' });
    const ent = await resolveEntitlement(db, USER);
    expect(ent.isPro).toBe(true);
    expect(ent.isTrial).toBe(true);
    expect(ent.billingPeriod).toBe('monthly');
  });

  it('is idempotent', async () => {
    const { db, sqlite } = createSqliteD1();
    seedUser(sqlite);
    sessions.set('cs_1', {
      id: 'cs_1', mode: 'subscription', status: 'complete', payment_status: 'paid',
      client_reference_id: USER, subscription: { id: 'sub_1' },
    });
    await confirmCheckoutSession({ ...env, DB: db }, USER, 'cs_1');
    await confirmCheckoutSession({ ...env, DB: db }, USER, 'cs_1');
    expect((await resolveEntitlement(db, USER)).isPro).toBe(true);
  });

  it('rejects a session belonging to another user', async () => {
    const { db, sqlite } = createSqliteD1();
    seedUser(sqlite);
    sessions.set('cs_1', {
      id: 'cs_1', mode: 'subscription', status: 'complete', payment_status: 'paid',
      client_reference_id: 'someone-else', subscription: 'sub_1',
    });
    expect(await confirmCheckoutSession({ ...env, DB: db }, USER, 'cs_1')).toEqual({ kind: 'forbidden' });
    expect((await resolveEntitlement(db, USER)).isPro).toBe(false);
  });

  it('does not activate an unfinished session', async () => {
    const { db, sqlite } = createSqliteD1();
    seedUser(sqlite);
    sessions.set('cs_1', {
      id: 'cs_1', mode: 'subscription', status: 'open', payment_status: 'unpaid',
      client_reference_id: USER, subscription: null,
    });
    expect(await confirmCheckoutSession({ ...env, DB: db }, USER, 'cs_1')).toEqual({ kind: 'pending' });
    expect((await resolveEntitlement(db, USER)).isPro).toBe(false);
  });
});
