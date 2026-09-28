import { Hono } from 'hono';
import type Stripe from 'stripe';
import { ok, fail } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import { findUserById } from '../db/users';
import { FREE_TIER, PRO_TIER } from '../lib/entitlement';
import {
  billingPeriodForPriceId,
  frontendUrl,
  getStripe,
  priceIdFor,
  stripeConfigured,
  TRIAL_PERIOD_DAYS,
  type BillingPeriod,
} from '../lib/stripe';
import {
  ensureCustomerRow,
  getSubscriptionByCustomerId,
  hasHadStripeSubscription,
  markWebhookEventProcessed,
  resolveEntitlement,
  upsertSubscriptionFromStripe,
  wasWebhookEventProcessed,
} from '../db/subscriptions';
import {
  getAiUsageForStatus,
  getImageUsageForStatus,
  FREE_AI_MESSAGES_PER_DAY,
  PRO_AI_MESSAGES_PER_DAY,
  FREE_IMAGE_UPLOAD_LIMIT,
} from '../db/quotas';

const PLANS = [
  {
    name: 'Pro Monthly',
    billingPeriod: 'monthly',
    priceCents: 499,
    currency: 'USD',
    priceDisplay: '$4.99/mo',
    productIdIos: 'com.lardermind.pro.monthly',
    productIdAndroid: 'com.lardermind.pro.monthly',
  },
  {
    name: 'Pro Yearly',
    billingPeriod: 'yearly',
    priceCents: 3999,
    currency: 'USD',
    priceDisplay: '$39.99/yr',
    productIdIos: 'com.lardermind.pro.yearly',
    productIdAndroid: 'com.lardermind.pro.yearly',
  },
];

export const subscriptionRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

subscriptionRoutes.get('/api/subscription/plans', (c) =>
  c.json(
    ok({
      plans: PLANS,
      free: FREE_TIER,
      pro: PRO_TIER,
      trialDays: TRIAL_PERIOD_DAYS,
      stripeCheckoutEnabled: stripeConfigured(c.env),
    }),
  ),
);

subscriptionRoutes.get('/api/subscription/status', requireAuth, async (c) => {
  const userId = c.get('userId');
  const user = await findUserById(c.env.DB, userId);
  if (!user) {
    return c.json(fail('User not found'), 401);
  }

  const entitlement = await resolveEntitlement(c.env.DB, userId, user.role);
  const ai = await getAiUsageForStatus(c.env.DB, userId);
  const image = await getImageUsageForStatus(c.env.DB, userId);

  const aiLimit = entitlement.isAdmin
    ? -1
    : entitlement.isPro
      ? PRO_AI_MESSAGES_PER_DAY
      : FREE_AI_MESSAGES_PER_DAY;
  const imageLimit = entitlement.isAdmin || entitlement.isPro ? -1 : FREE_IMAGE_UPLOAD_LIMIT;
  const recipeImportsLimit = entitlement.isPro
    ? PRO_TIER.recipeImportsPerMonth
    : FREE_TIER.recipeImportsPerMonth;
  const recipeLimit = entitlement.isPro ? PRO_TIER.maxRecipes : FREE_TIER.maxRecipes;

  return c.json(
    ok({
      isPro: entitlement.isPro,
      isTrial: entitlement.isTrial,
      trialEndsAt: entitlement.trialEndsAt ?? undefined,
      expiresAt: entitlement.expiresAt ?? undefined,
      productId:
        entitlement.billingPeriod === 'monthly'
          ? 'com.lardermind.pro.monthly'
          : entitlement.billingPeriod === 'yearly'
            ? 'com.lardermind.pro.yearly'
            : undefined,
      planName: entitlement.planName ?? undefined,
      usage: {
        aiMessagesUsed: ai.used,
        aiMessagesLimit: aiLimit,
        recipeImportsUsed: 0,
        recipeImportsLimit,
        recipeCount: 0,
        recipeLimit,
        imageUploadsUsed: image.used,
        imageUploadsLimit: imageLimit,
      },
    }),
  );
});

subscriptionRoutes.post('/api/subscription/checkout', requireAuth, async (c) => {
  if (!stripeConfigured(c.env)) {
    return c.json(fail('Stripe is not configured'), 503);
  }

  const userId = c.get('userId');
  const user = await findUserById(c.env.DB, userId);
  if (!user) {
    return c.json(fail('User not found'), 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    billingPeriod?: string;
  };
  const billingPeriod = body.billingPeriod;
  if (billingPeriod !== 'monthly' && billingPeriod !== 'yearly') {
    return c.json(fail('billingPeriod must be monthly or yearly'), 400);
  }

  const entitlement = await resolveEntitlement(c.env.DB, userId, user.role);
  if (entitlement.isPro && !entitlement.isAdmin) {
    try {
      const portalUrl = await createPortalSessionUrl(c.env, entitlement.stripeCustomerId);
      return c.json(
        {
          success: false,
          message: 'Already subscribed',
          data: { portalUrl },
        },
        409,
      );
    } catch {
      return c.json(fail('Already subscribed'), 409);
    }
  }

  try {
    const stripe = getStripe(c.env);
    const customerId = await ensureStripeCustomer(c.env, stripe, userId, user.email);
    const price = priceIdFor(c.env, billingPeriod);
    const base = frontendUrl(c.env);
    const hadSub = await hasHadStripeSubscription(c.env.DB, userId);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: userId,
      line_items: [{ price, quantity: 1 }],
      success_url: `${base}/?subscription=success`,
      cancel_url: `${base}/?subscription=cancelled`,
      metadata: { userId },
      subscription_data: {
        metadata: { userId },
        ...(hadSub ? {} : { trial_period_days: TRIAL_PERIOD_DAYS }),
      },
    });

    if (!session.url) {
      return c.json(fail('Failed to create checkout session'), 502);
    }

    return c.json(ok({ checkoutUrl: session.url }));
  } catch (error) {
    console.error('checkout failed', error);
    return c.json(fail('Unable to start checkout'), 502);
  }
});

subscriptionRoutes.post('/api/subscription/portal', requireAuth, async (c) => {
  if (!stripeConfigured(c.env)) {
    return c.json(fail('Stripe is not configured'), 503);
  }

  const userId = c.get('userId');
  const entitlement = await resolveEntitlement(c.env.DB, userId);
  if (!entitlement.stripeCustomerId) {
    return c.json(fail('No billing customer'), 400);
  }

  try {
    const portalUrl = await createPortalSessionUrl(c.env, entitlement.stripeCustomerId);
    return c.json(ok({ portalUrl }));
  } catch (error) {
    console.error('portal failed', error);
    return c.json(fail('Unable to open billing portal'), 502);
  }
});

subscriptionRoutes.post('/api/subscription/webhook', async (c) => {
  if (!c.env.STRIPE_SECRET_KEY || !c.env.STRIPE_WEBHOOK_SECRET) {
    return c.json(fail('Stripe webhook is not configured'), 503);
  }

  const signature = c.req.header('Stripe-Signature') ?? '';
  const payload = await c.req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe(c.env);
    event = await stripe.webhooks.constructEventAsync(
      payload,
      signature,
      c.env.STRIPE_WEBHOOK_SECRET,
    );
  } catch (error) {
    console.error('webhook signature failed', error);
    return c.json(fail('Invalid signature'), 400);
  }

  if (await wasWebhookEventProcessed(c.env.DB, event.id)) {
    return c.json({ received: true });
  }

  try {
    await handleStripeEvent(c.env, event);
    await markWebhookEventProcessed(c.env.DB, event.id, event.type);
  } catch (error) {
    console.error('webhook handler failed', error);
    return c.json(fail('Webhook handler error'), 500);
  }

  return c.json({ received: true });
});

async function ensureStripeCustomer(
  env: Env,
  stripe: Stripe,
  userId: string,
  email: string,
): Promise<string> {
  const existing = await resolveEntitlement(env.DB, userId);
  if (existing.stripeCustomerId) {
    return existing.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email,
    metadata: { userId },
  });
  await ensureCustomerRow(env.DB, userId, customer.id);
  return customer.id;
}

async function createPortalSessionUrl(
  env: Env,
  stripeCustomerId: string | null,
): Promise<string> {
  if (!stripeCustomerId) {
    throw new Error('Missing Stripe customer');
  }
  const stripe = getStripe(env);
  const session = await stripe.billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: `${frontendUrl(env)}/?subscription=portal_return`,
  });
  if (!session.url) {
    throw new Error('Portal session missing url');
  }
  return session.url;
}

async function handleStripeEvent(env: Env, event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== 'subscription') return;
      const subscriptionId =
        typeof session.subscription === 'string'
          ? session.subscription
          : session.subscription?.id;
      if (!subscriptionId) return;
      const stripe = getStripe(env);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(env, subscription, session.client_reference_id);
      return;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      const subscription = event.data.object as Stripe.Subscription;
      await syncSubscription(env, subscription);
      return;
    }
    case 'invoice.paid':
    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = invoiceSubscriptionId(invoice);
      if (!subscriptionId) return;
      const stripe = getStripe(env);
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await syncSubscription(env, subscription);
      return;
    }
    default:
      return;
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as Stripe.Invoice & { subscription?: string | { id: string } | null })
    .subscription;
  if (!sub) return null;
  return typeof sub === 'string' ? sub : sub.id;
}

async function syncSubscription(
  env: Env,
  subscription: Stripe.Subscription,
  clientReferenceId?: string | null,
): Promise<void> {
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id;

  let userId =
    subscription.metadata?.userId ||
    clientReferenceId ||
    null;

  if (!userId) {
    const byCustomer = await getSubscriptionByCustomerId(env.DB, customerId);
    userId = byCustomer?.user_id ?? null;
  }

  if (!userId) {
    const stripe = getStripe(env);
    const customer = await stripe.customers.retrieve(customerId);
    if (!customer.deleted) {
      userId = customer.metadata?.userId ?? null;
    }
  }

  if (!userId) {
    console.warn('stripe webhook: could not resolve userId', subscription.id);
    return;
  }

  const priceId = subscription.items.data[0]?.price?.id ?? null;
  const billingPeriod =
    billingPeriodForPriceId(env, priceId) ??
    (priceId ? inferBillingPeriodFromPrice(subscription.items.data[0]?.price) : null);

  const period = subscriptionPeriod(subscription);

  await upsertSubscriptionFromStripe(env.DB, {
    userId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    stripePriceId: priceId,
    status: subscription.status,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodStart: period.start,
    currentPeriodEnd: period.end,
    trialEnd: subscription.trial_end,
    billingPeriod,
  });
}

function subscriptionPeriod(subscription: Stripe.Subscription): {
  start: number | null;
  end: number | null;
} {
  const raw = subscription as Stripe.Subscription & {
    current_period_start?: number;
    current_period_end?: number;
  };
  const item = subscription.items?.data?.[0] as
    | (Stripe.SubscriptionItem & {
        current_period_start?: number;
        current_period_end?: number;
      })
    | undefined;

  return {
    start: raw.current_period_start ?? item?.current_period_start ?? null,
    end: raw.current_period_end ?? item?.current_period_end ?? null,
  };
}

function inferBillingPeriodFromPrice(
  price: Stripe.Price | undefined,
): BillingPeriod | null {
  if (!price?.recurring?.interval) return null;
  if (price.recurring.interval === 'year') return 'yearly';
  if (price.recurring.interval === 'month') return 'monthly';
  return null;
}
