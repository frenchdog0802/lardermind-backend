/**
 * Local Stripe API smoke (no Playwright / no Stripe CLI).
 * Reads backend-cf/.dev.vars; talks to http://127.0.0.1:8787.
 * Does not print secrets.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Stripe from 'stripe';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const BASE = process.env.SMOKE_API_BASE ?? 'http://127.0.0.1:8787';

function loadDevVars() {
  const text = readFileSync(resolve(ROOT, '.dev.vars'), 'utf8');
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    out[t.slice(0, i)] = t.slice(i + 1);
  }
  return out;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function json(method, path, { token, body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }
  return { status: res.status, data };
}

const results = [];
function step(name, ok, detail = '') {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const env = loadDevVars();
  for (const k of [
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_MONTHLY',
    'STRIPE_PRICE_YEARLY',
  ]) {
    assert(env[k]?.trim(), `Missing ${k} in .dev.vars`);
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2025-02-24.acacia',
  });

  // 0) health
  {
    const { status, data } = await json('GET', '/api/health');
    step('health', status === 200, `status=${status}`);
  }

  // 1) plans flag
  {
    const { status, data } = await json('GET', '/api/subscription/plans');
    const enabled = data?.data?.stripeCheckoutEnabled === true;
    step(
      'plans.stripeCheckoutEnabled',
      status === 200 && enabled,
      `status=${status} enabled=${data?.data?.stripeCheckoutEnabled}`,
    );
  }

  // 2) signup
  const email = `stripe-smoke-${Date.now()}@example.com`;
  let token;
  let userId;
  {
    const { status, data } = await json('POST', '/api/auth/signup', {
      body: {
        first_name: 'Stripe',
        last_name: 'Smoke',
        email,
        password: 'secret12345',
      },
    });
    token = data?.data?.token ?? data?.token;
    userId = data?.data?.user?.id ?? data?.data?.userId ?? data?.user?.id;
    // some auth envelopes nest differently — fall back to login decode later
    step('signup', status === 200 || status === 201, `status=${status}`);
    if (!token) {
      const login = await json('POST', '/api/auth/login', {
        body: { email, password: 'secret12345' },
      });
      token = login.data?.data?.token ?? login.data?.token;
      userId = userId ?? login.data?.data?.user?.id;
      step('login-fallback', Boolean(token), `status=${login.status}`);
    }
  }
  assert(token, 'No JWT after signup/login');

  // 3) status free
  {
    const { status, data } = await json('GET', '/api/subscription/status', { token });
    const isPro = data?.data?.isPro;
    userId = userId ?? data?.data?.userId;
    step('status.before.isPro=false', status === 200 && isPro === false, `isPro=${isPro}`);
  }

  // Resolve userId from JWT payload if needed (middle segment)
  if (!userId) {
    const mid = token.split('.')[1];
    const payload = JSON.parse(Buffer.from(mid, 'base64url').toString('utf8'));
    userId = payload.sub ?? payload.userId ?? payload.id;
  }
  assert(userId, 'Could not resolve userId');

  // 4) checkout session
  let checkoutUrl;
  let customerId;
  {
    const { status, data } = await json('POST', '/api/subscription/checkout', {
      token,
      body: { billingPeriod: 'monthly' },
    });
    checkoutUrl = data?.data?.checkoutUrl;
    step(
      'checkout.monthly',
      status === 200 && typeof checkoutUrl === 'string' && checkoutUrl.includes('checkout.stripe.com'),
      `status=${status} hasUrl=${Boolean(checkoutUrl)}`,
    );
  }

  // Find Stripe customer created by checkout path (metadata.userId)
  {
    const list = await stripe.customers.list({ email, limit: 5 });
    customerId = list.data.find((c) => c.metadata?.userId === userId)?.id ?? list.data[0]?.id;
    step('stripe.customer.created', Boolean(customerId), customerId ? `cus=…${customerId.slice(-6)}` : 'none');
  }
  assert(customerId, 'No Stripe customer for smoke user');

  // 5) Create real test subscription (skips hosted Checkout UI)
  let subscription;
  {
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: env.STRIPE_PRICE_MONTHLY }],
      trial_period_days: 7,
      metadata: { userId },
      payment_behavior: 'default_incomplete',
      expand: ['latest_invoice.payment_intent'],
    });
    // Prefer trialing if Stripe applied trial
    step(
      'stripe.subscription.create',
      ['trialing', 'active', 'incomplete'].includes(subscription.status),
      `status=${subscription.status} id=…${subscription.id.slice(-6)}`,
    );
  }

  // If incomplete (no payment method), update to active-like via trial only — retrieve after ensuring trial
  if (subscription.status === 'incomplete') {
    // Cancel incomplete and recreate with trial (no payment required during trial)
    await stripe.subscriptions.cancel(subscription.id);
    subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: env.STRIPE_PRICE_MONTHLY }],
      trial_period_days: 7,
      metadata: { userId },
    });
    step(
      'stripe.subscription.recreate_trial',
      subscription.status === 'trialing' || subscription.status === 'active',
      `status=${subscription.status}`,
    );
  }

  // 6) Signed webhook → Worker
  {
    const full = await stripe.subscriptions.retrieve(subscription.id, {
      expand: ['items.data.price'],
    });
    const event = {
      id: `evt_smoke_${Date.now()}`,
      object: 'event',
      api_version: '2025-02-24.acacia',
      created: Math.floor(Date.now() / 1000),
      type: 'customer.subscription.created',
      livemode: false,
      pending_webhooks: 1,
      request: { id: null, idempotency_key: null },
      data: { object: full },
    };
    const payload = JSON.stringify(event);
    const header = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: env.STRIPE_WEBHOOK_SECRET,
    });
    const res = await fetch(`${BASE}/api/subscription/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Stripe-Signature': header,
      },
      body: payload,
    });
    const text = await res.text();
    step('webhook.signed', res.status === 200, `status=${res.status} body=${text.slice(0, 80)}`);
  }

  // 7) status Pro
  {
    const { status, data } = await json('GET', '/api/subscription/status', { token });
    const d = data?.data;
    step(
      'status.after.isPro',
      status === 200 && d?.isPro === true,
      `isPro=${d?.isPro} isTrial=${d?.isTrial} plan=${d?.planName}`,
    );
  }

  // 8) already subscribed → 409 portal
  {
    const { status, data } = await json('POST', '/api/subscription/checkout', {
      token,
      body: { billingPeriod: 'monthly' },
    });
    const portal = data?.data?.portalUrl;
    step(
      'checkout.already_subscribed_409',
      status === 409 && typeof portal === 'string',
      `status=${status} hasPortal=${Boolean(portal)}`,
    );
  }

  // Cleanup Stripe objects (best-effort)
  try {
    if (subscription?.id) await stripe.subscriptions.cancel(subscription.id);
  } catch {
    /* ignore */
  }

  const failed = results.filter((r) => !r.ok);
  console.log('\n--- summary ---');
  console.log(`passed=${results.length - failed.length} failed=${failed.length}`);
  if (failed.length) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('SMOKE FATAL:', err.message);
  process.exitCode = 1;
});
