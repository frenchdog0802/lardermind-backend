import Stripe from 'stripe';
import type { Env } from '../env';

export type BillingPeriod = 'monthly' | 'yearly';

export const TRIAL_PERIOD_DAYS = 7;

export function stripeConfigured(env: Env): boolean {
  return Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      env.STRIPE_PRICE_MONTHLY &&
      env.STRIPE_PRICE_YEARLY &&
      env.FRONTEND_URL,
  );
}

export function priceIdFor(env: Env, billingPeriod: BillingPeriod): string {
  const priceId =
    billingPeriod === 'monthly' ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY;
  if (!priceId) {
    throw new Error(`Missing Stripe price for ${billingPeriod}`);
  }
  return priceId;
}

export function billingPeriodForPriceId(
  env: Env,
  priceId: string | null | undefined,
): BillingPeriod | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_MONTHLY) return 'monthly';
  if (priceId === env.STRIPE_PRICE_YEARLY) return 'yearly';
  return null;
}

export function getStripe(env: Env): Stripe {
  if (!env.STRIPE_SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2026-08-26.dahlia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function frontendUrl(env: Env): string {
  return env.FRONTEND_URL.replace(/\/$/, '');
}
