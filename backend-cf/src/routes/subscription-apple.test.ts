import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { makeChain, signJws, type TestChain } from '../test-utils/apple-fixtures';
import type { Env } from '../env';
import { signJwt } from '../lib/jwt';
import { subscriptionAppleRoutes, appleRouteTestHooks } from './subscription-apple';
import { resolveEntitlement } from '../db/subscriptions';
import { getAppleSubscription } from '../db/apple-subscriptions';
import { upsertSubscriptionFromStripe } from '../db/subscriptions';

const SECRET = 's'.repeat(40);
const BUNDLE = 'com.lardermind.app';
const MONTHLY = 'com.lardermind.pro.monthly';
const YEARLY = 'com.lardermind.pro.yearly';
const NOW = Date.now();
const DAY = 86400_000;

let chain: TestChain;
let env: Env;
let sqlite: import('node:sqlite').DatabaseSync;
let app: Hono<{ Bindings: Env }>;

function seedUser(id: string) {
  sqlite
    .prepare(
      `INSERT INTO users (id, first_name, last_name, name, email, role, created_at, updated_at)
       VALUES (?, 'A', 'B', 'A B', ?, 'user', 1, 1)`,
    )
    .run(id, `${id}@example.com`);
}

function tx(over: Record<string, unknown> = {}) {
  return {
    transactionId: 'tx-1',
    originalTransactionId: 'orig-1',
    bundleId: BUNDLE,
    productId: MONTHLY,
    type: 'Auto-Renewable Subscription',
    purchaseDate: NOW - 1000,
    expiresDate: NOW + 7 * DAY,
    offerType: 1,
    offerDiscountType: 'FREE_TRIAL',
    environment: 'Sandbox',
    signedDate: NOW,
    ...over,
  };
}

async function post(path: string, body: unknown, userId?: string) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (userId) headers.authorization = `Bearer ${await signJwt(userId, SECRET, 3600)}`;
  return app.request(path, { method: 'POST', headers, body: JSON.stringify(body) }, env);
}

const validate = (jws: string, userId = 'u1') =>
  post(
    '/api/subscription/validate-receipt',
    { platform: 'ios', receipt: jws, productId: MONTHLY },
    userId,
  );

beforeEach(() => {
  const d1 = createSqliteD1();
  sqlite = d1.sqlite;
  env = { DB: d1.db, JWT_SECRET: SECRET } as unknown as Env;
  chain = makeChain();
  appleRouteTestHooks.ctx = { verifyOptions: { rootCertsDer: [chain.root.der] } };
  app = new Hono<{ Bindings: Env }>();
  app.route('/', subscriptionAppleRoutes as never);
  seedUser('u1');
  seedUser('u2');
});

describe('POST /api/subscription/validate-receipt', () => {
  it('requires auth', async () => {
    const res = await post('/api/subscription/validate-receipt', { platform: 'ios', receipt: 'a.b.c' });
    expect(res.status).toBe(401);
  });

  it('grants Pro trial from a valid signed transaction and stores originalTransactionId/expiry', async () => {
    const res = await validate(signJws(tx(), chain));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, any> };
    expect(json.data.valid).toBe(true);
    expect(json.data.productId).toBe(MONTHLY);
    expect(json.data.status).toMatchObject({ isPro: true, isTrial: true, source: 'apple' });
    expect(json.data.status.usage.aiMessagesLimit).toBe(300); // same Pro quota as Stripe

    const row = await getAppleSubscription(env.DB, 'orig-1');
    expect(row).toMatchObject({
      user_id: 'u1',
      status: 'trialing',
      environment: 'Sandbox',
      billing_period: 'monthly',
    });
    expect(row!.expires_at).toBe(Math.floor((NOW + 7 * DAY) / 1000));

    const ent = await resolveEntitlement(env.DB, 'u1');
    expect(ent).toMatchObject({ isPro: true, isTrial: true, planName: 'Pro Monthly', source: 'apple' });
  });

  it('treats a paid (non-trial) yearly transaction as active Pro Yearly', async () => {
    const res = await validate(
      signJws(tx({ productId: YEARLY, offerType: undefined, offerDiscountType: undefined, expiresDate: NOW + 365 * DAY }), chain),
    );
    expect(res.status).toBe(200);
    const ent = await resolveEntitlement(env.DB, 'u1');
    expect(ent).toMatchObject({ isPro: true, isTrial: false, planName: 'Pro Yearly', status: 'active' });
  });

  it('rejects wrong bundle id, unknown product, bad signature, legacy receipts and android', async () => {
    expect((await validate(signJws(tx({ bundleId: 'com.evil.app' }), chain))).status).toBe(400);
    expect((await validate(signJws(tx({ productId: 'com.other.sku' }), chain))).status).toBe(400);
    expect((await validate(signJws(tx({ environment: 'Xcode' }), chain))).status).toBe(400);
    const other = makeChain();
    expect((await validate(signJws(tx(), other))).status).toBe(400);
    expect((await validate('bm90LWEtand0')).status).toBe(400);
    const android = await post(
      '/api/subscription/validate-receipt',
      { platform: 'android', receipt: 'x' },
      'u1',
    );
    expect(android.status).toBe(501);
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('refuses Production-only servers accepting Sandbox transactions when configured', async () => {
    env = { ...env, APPLE_ALLOWED_ENVIRONMENTS: 'Production' } as Env;
    expect((await validate(signJws(tx({ environment: 'Sandbox' }), chain))).status).toBe(400);
    expect((await validate(signJws(tx({ environment: 'Production' }), chain))).status).toBe(200);
  });

  it('does not grant Pro for an expired or revoked transaction', async () => {
    await validate(signJws(tx({ expiresDate: NOW - DAY }), chain));
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
    await validate(
      signJws(tx({ originalTransactionId: 'orig-2', revocationDate: NOW - 1000 }), chain),
    );
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('is idempotent and 409s when an active subscription belongs to another account', async () => {
    const jws = signJws(tx(), chain);
    expect((await validate(jws, 'u1')).status).toBe(200);
    expect((await validate(jws, 'u1')).status).toBe(200);
    const conflict = await validate(jws, 'u2');
    expect(conflict.status).toBe(409);
    expect((await resolveEntitlement(env.DB, 'u2')).isPro).toBe(false);
  });

  it('lets an expired subscription be re-linked to another account', async () => {
    await validate(signJws(tx({ expiresDate: NOW - DAY, signedDate: NOW - 2 * DAY }), chain), 'u1');
    const res = await validate(signJws(tx({ signedDate: NOW }), chain), 'u2');
    expect(res.status).toBe(200);
    expect((await resolveEntitlement(env.DB, 'u2')).isPro).toBe(true);
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('sync returns the status wrapper the mobile client expects', async () => {
    const res = await post(
      '/api/subscription/sync',
      { platform: 'ios', receipt: signJws(tx(), chain), productId: MONTHLY, transactionId: 'tx-1' },
      'u1',
    );
    const json = (await res.json()) as { data: { success: boolean; status: { isPro: boolean } } };
    expect(json.data.success).toBe(true);
    expect(json.data.status.isPro).toBe(true);
  });

  it('sync without a signed transaction (old stub shape) is rejected', async () => {
    const res = await post(
      '/api/subscription/sync',
      { platform: 'ios', productId: MONTHLY, transactionId: 'expo-stub-1' },
      'u1',
    );
    expect(res.status).toBe(400);
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });
});

describe('entitlement merge with Stripe', () => {
  it('Stripe Pro wins; Apple alone also grants Pro; both lapse -> free', async () => {
    await upsertSubscriptionFromStripe(env.DB, {
      userId: 'u1',
      stripeCustomerId: 'cus_1',
      status: 'active',
      currentPeriodEnd: Math.floor(NOW / 1000) + 1000,
      billingPeriod: 'yearly',
    });
    await validate(signJws(tx(), chain));
    expect(await resolveEntitlement(env.DB, 'u1')).toMatchObject({
      isPro: true,
      source: 'stripe',
      planName: 'Pro Yearly',
    });

    await upsertSubscriptionFromStripe(env.DB, {
      userId: 'u1',
      stripeCustomerId: 'cus_1',
      status: 'canceled',
    });
    expect(await resolveEntitlement(env.DB, 'u1')).toMatchObject({ isPro: true, source: 'apple' });
  });

  it('an Apple row whose period ended is not Pro even if no EXPIRED notification arrived', async () => {
    await validate(signJws(tx(), chain));
    sqlite.prepare('UPDATE apple_subscriptions SET expires_at = ?').run(Math.floor(NOW / 1000) - 5);
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });
});

describe('POST /api/subscription/apple-notifications', () => {
  function notification(
    type: string,
    txOver: Record<string, unknown> = {},
    extra: { subtype?: string; uuid?: string; signedDate?: number; renewal?: Record<string, unknown>; env?: string } = {},
  ) {
    return signJws(
      {
        notificationType: type,
        subtype: extra.subtype,
        notificationUUID: extra.uuid ?? `uuid-${type}-${Math.random()}`,
        signedDate: extra.signedDate ?? NOW + 1000,
        data: {
          environment: extra.env ?? 'Sandbox',
          bundleId: BUNDLE,
          signedTransactionInfo: signJws(tx(txOver), chain),
          ...(extra.renewal ? { signedRenewalInfo: signJws({ ...extra.renewal }, chain) } : {}),
        },
      },
      chain,
    );
  }
  const send = (signedPayload: string) => post('/api/subscription/apple-notifications', { signedPayload });

  beforeEach(async () => {
    await validate(signJws(tx(), chain));
  });

  it('rejects unsigned / forged payloads', async () => {
    expect((await send('x.y.z')).status).toBe(400);
    const other = makeChain();
    const forged = signJws({ notificationType: 'DID_RENEW', notificationUUID: 'f' }, other);
    expect((await send(forged)).status).toBe(400);
    expect((await post('/api/subscription/apple-notifications', {})).status).toBe(400);
  });

  it('DID_RENEW extends expiry and moves trialing -> active', async () => {
    const newExpiry = NOW + 37 * DAY;
    const res = await send(
      notification('DID_RENEW', {
        transactionId: 'tx-2',
        offerType: undefined,
        offerDiscountType: undefined,
        expiresDate: newExpiry,
      }),
    );
    expect(res.status).toBe(200);
    const row = await getAppleSubscription(env.DB, 'orig-1');
    expect(row).toMatchObject({ status: 'active', latest_transaction_id: 'tx-2', trial_end: null });
    expect(row!.expires_at).toBe(Math.floor(newExpiry / 1000));
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(true);
  });

  it('EXPIRED removes Pro', async () => {
    await send(notification('EXPIRED', { expiresDate: NOW - 1000 }, { subtype: 'VOLUNTARY' }));
    expect((await getAppleSubscription(env.DB, 'orig-1'))!.status).toBe('expired');
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('REFUND revokes Pro immediately even though the period has not ended', async () => {
    await send(notification('REFUND', { revocationDate: NOW + 500 }));
    const row = await getAppleSubscription(env.DB, 'orig-1');
    expect(row).toMatchObject({ status: 'revoked' });
    expect(row!.revoked_at).not.toBeNull();
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('DID_FAIL_TO_RENEW with grace period keeps Pro (past_due); without grace it does not', async () => {
    const graceEnd = NOW + 16 * DAY;
    await send(
      notification(
        'DID_FAIL_TO_RENEW',
        { expiresDate: NOW + 100 },
        { subtype: 'GRACE_PERIOD', renewal: { gracePeriodExpiresDate: graceEnd, autoRenewStatus: 1 } },
      ),
    );
    expect(await resolveEntitlement(env.DB, 'u1')).toMatchObject({ isPro: true, status: 'past_due' });
    await send(notification('DID_FAIL_TO_RENEW', { expiresDate: NOW + 100 }, { signedDate: NOW + 5000 }));
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('DID_CHANGE_RENEWAL_STATUS records auto-renew off but keeps Pro until expiry', async () => {
    await send(
      notification('DID_CHANGE_RENEWAL_STATUS', {}, { subtype: 'AUTO_RENEW_DISABLED', renewal: { autoRenewStatus: 0 } }),
    );
    const row = await getAppleSubscription(env.DB, 'orig-1');
    expect(row!.auto_renew).toBe(0);
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(true);
  });

  it('is idempotent per notificationUUID and ignores out-of-order (older) notifications', async () => {
    const refund = notification('REFUND', { revocationDate: NOW + 500 }, { uuid: 'same', signedDate: NOW + 10_000 });
    expect(((await (await send(refund)).json()) as any).outcome).toBe('applied');
    expect(((await (await send(refund)).json()) as any).outcome).toBe('duplicate');

    // an older DID_RENEW (signed before the refund) arrives late: must not resurrect Pro
    const late = notification('DID_RENEW', { transactionId: 'tx-old' }, { signedDate: NOW + 2_000 });
    await send(late);
    expect((await getAppleSubscription(env.DB, 'orig-1'))!.status).toBe('revoked');
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('a stale client receipt cannot undo a newer refund', async () => {
    await send(notification('REFUND', { revocationDate: NOW + 500 }, { signedDate: NOW + 10_000 }));
    const res = await validate(signJws(tx({ signedDate: NOW }), chain));
    expect(res.status).toBe(200);
    expect((await resolveEntitlement(env.DB, 'u1')).isPro).toBe(false);
  });

  it('acknowledges unknown subscriptions and TEST notifications with 200', async () => {
    const unknown = await send(notification('DID_RENEW', { originalTransactionId: 'orig-unknown' }));
    expect(unknown.status).toBe(200);
    expect(((await unknown.json()) as any).outcome).toBe('unknown_subscription');

    const test = signJws({ notificationType: 'TEST', notificationUUID: 'test-1', signedDate: NOW, data: {} }, chain);
    expect(((await (await send(test)).json()) as any).outcome).toBe('ignored');
  });

  it('rejects notifications for another bundle id', async () => {
    const bad = signJws(
      {
        notificationType: 'DID_RENEW',
        notificationUUID: 'b1',
        signedDate: NOW,
        data: { environment: 'Sandbox', bundleId: 'com.evil.app', signedTransactionInfo: signJws(tx(), chain) },
      },
      chain,
    );
    expect((await send(bad)).status).toBe(400);
  });

  it('handles Production notifications for the production environment', async () => {
    const res = await send(
      notification('DID_RENEW', { environment: 'Production' }, { env: 'Production' }),
    );
    expect(res.status).toBe(200);
    expect((await getAppleSubscription(env.DB, 'orig-1'))!.environment).toBe('Production');
  });
});
