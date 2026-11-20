import { Hono, type Context } from 'hono';
import { ok, fail } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth, requireNonGuest } from '../middleware/auth';
import { findUserById } from '../db/users';
import { AppleLinkConflictError } from '../db/apple-subscriptions';
import {
  AppleValidationError,
  applyClientTransaction,
  handleAppleNotification,
  type AppleVerifyContext,
} from '../lib/apple-iap';
import { buildSubscriptionStatus } from './subscription';

/** Test seam: lets tests inject a trusted root / clock without touching production defaults. */
export const appleRouteTestHooks: { ctx?: AppleVerifyContext } = {};

type AppCtx = Context<{ Bindings: Env; Variables: AuthVariables }>;

export const subscriptionAppleRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

type ReceiptBody = {
  platform?: unknown;
  /** StoreKit 2 signed transaction (JWS). react-native-iap exposes it as `purchaseToken` on iOS. */
  receipt?: unknown;
  signedTransaction?: unknown;
  productId?: unknown;
};

function readJws(body: ReceiptBody): string {
  const raw = typeof body.receipt === 'string' ? body.receipt : body.signedTransaction;
  return typeof raw === 'string' ? raw.trim() : '';
}

async function linkTransaction(c: AppCtx, mode: 'validate' | 'sync') {
  const body = (await c.req.json().catch(() => ({}))) as ReceiptBody;
  if (body.platform !== 'ios') {
    return c.json(
      fail('Only platform "ios" is supported'),
      body.platform === 'android' ? 501 : 400,
    );
  }
  const jws = readJws(body);
  // JWS compact serialisation only; legacy base64 app receipts and bare transaction ids are rejected.
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jws)) {
    return c.json(fail('A StoreKit 2 signed transaction (JWS) is required'), 400);
  }

  const userId = c.get('userId');
  const user = await findUserById(c.env.DB, userId);
  if (!user) return c.json(fail('User not found'), 401);

  let result;
  try {
    result = await applyClientTransaction(c.env, userId, jws, appleRouteTestHooks.ctx);
  } catch (error) {
    if (error instanceof AppleLinkConflictError) return c.json(fail(error.message), 409);
    if (error instanceof AppleValidationError) {
      console.warn('apple receipt rejected', error.message);
      return c.json(fail(error.message), 400);
    }
    console.error('apple receipt failed', error);
    return c.json(fail('Unable to validate purchase'), 502);
  }

  if (typeof body.productId === 'string' && body.productId !== result.row.product_id) {
    // The signed transaction is authoritative; a mismatching hint from the client is only logged.
    console.warn('apple receipt productId hint mismatch', body.productId, result.row.product_id);
  }

  const status = await buildSubscriptionStatus(c.env, userId, user.role);
  if (mode === 'sync') {
    return c.json(ok({ success: true, status }));
  }
  return c.json(
    ok({
      valid: status.isPro && status.source === 'apple',
      expiresAt: result.row.expires_at ?? undefined,
      productId: result.row.product_id,
      status,
    }),
  );
}

subscriptionAppleRoutes.post(
  '/api/subscription/validate-receipt',
  requireAuth,
  requireNonGuest,
  (c) => linkTransaction(c, 'validate'),
);

subscriptionAppleRoutes.post(
  '/api/subscription/sync',
  requireAuth,
  requireNonGuest,
  (c) => linkTransaction(c, 'sync'),
);

/**
 * App Store Server Notifications V2. Public (Apple calls it); authenticity comes solely from the
 * JWS signature chain pinned to Apple Root CA - G3. The same URL serves Production and Sandbox.
 */
subscriptionAppleRoutes.post('/api/subscription/apple-notifications', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { signedPayload?: unknown };
  if (typeof body.signedPayload !== 'string' || !body.signedPayload) {
    return c.json(fail('signedPayload is required'), 400);
  }
  try {
    const outcome = await handleAppleNotification(
      c.env,
      body.signedPayload,
      appleRouteTestHooks.ctx,
    );
    return c.json({ received: true, outcome: outcome.kind });
  } catch (error) {
    if (error instanceof AppleValidationError) {
      console.warn('apple notification rejected', error.message);
      return c.json(fail('Invalid notification'), 400);
    }
    console.error('apple notification failed', error);
    return c.json(fail('Notification handler error'), 500); // Apple retries on 5xx
  }
});
