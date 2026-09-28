import { describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { isEntitled } from './entitlement';
import {
  billingPeriodForPriceId,
  priceIdFor,
  stripeConfigured,
} from './stripe';
import type { Env } from '../env';

describe('isEntitled', () => {
  it.each([
    ['active', true],
    ['trialing', true],
    ['past_due', true],
    ['canceled', false],
    ['unpaid', false],
    ['incomplete', false],
    ['none', false],
    [null, false],
    [undefined, false],
  ] as const)('%s → %s', (status, expected) => {
    expect(isEntitled(status)).toBe(expected);
  });
});

describe('stripeConfigured', () => {
  it('requires all stripe fields and FRONTEND_URL', () => {
    const base = {
      STRIPE_SECRET_KEY: 'sk_test',
      STRIPE_WEBHOOK_SECRET: 'whsec',
      STRIPE_PRICE_MONTHLY: 'price_m',
      STRIPE_PRICE_YEARLY: 'price_y',
      FRONTEND_URL: 'https://lardermind.com',
    } as Env;

    expect(stripeConfigured(base)).toBe(true);
    expect(stripeConfigured({ ...base, STRIPE_SECRET_KEY: undefined })).toBe(false);
    expect(stripeConfigured({ ...base, STRIPE_PRICE_YEARLY: '' })).toBe(false);
  });
});

describe('priceIdFor / billingPeriodForPriceId', () => {
  const env = {
    STRIPE_PRICE_MONTHLY: 'price_month',
    STRIPE_PRICE_YEARLY: 'price_year',
  } as Env;

  it('maps billing period to price id', () => {
    expect(priceIdFor(env, 'monthly')).toBe('price_month');
    expect(priceIdFor(env, 'yearly')).toBe('price_year');
  });

  it('maps price id back to billing period', () => {
    expect(billingPeriodForPriceId(env, 'price_month')).toBe('monthly');
    expect(billingPeriodForPriceId(env, 'price_year')).toBe('yearly');
    expect(billingPeriodForPriceId(env, 'price_other')).toBeNull();
  });
});

describe('stripe webhook constructEventAsync', () => {
  it('rejects invalid signatures', async () => {
    const stripe = new Stripe('sk_test_123', {
      apiVersion: '2026-08-26.dahlia',
      httpClient: Stripe.createFetchHttpClient(),
    });

    await expect(
      stripe.webhooks.constructEventAsync('{}', 'bad', 'whsec_test'),
    ).rejects.toThrow();
  });
});
