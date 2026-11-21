export const ENTITLED_STATUSES = new Set(['active', 'trialing', 'past_due']);

export function isEntitled(status: string | null | undefined): boolean {
  if (!status) return false;
  return ENTITLED_STATUSES.has(status);
}

export type Entitlement = {
  isPro: boolean;
  isTrial: boolean;
  isAdmin: boolean;
  status: string;
  trialEndsAt: number | null;
  expiresAt: number | null;
  planName: string | null;
  billingPeriod: string | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  hasHadSubscription: boolean;
  /** Which store grants Pro right now (null when not Pro via a paid subscription). */
  source: 'stripe' | 'apple' | null;
  appleOriginalTransactionId: string | null;
};

export const GUEST_TIER = {
  aiMessagesPerDay: 5,
  recipeImportsPerMonth: 0,
  maxRecipes: 10,
  imageUploadsPerMonth: 0,
};

export const FREE_TIER = {
  aiMessagesPerWeek: 50,
  recipeImportsPerMonth: 3,
  maxRecipes: 50,
  imageUploadsPerMonth: 10,
};

/** Guest JWT / kitchen TTL (seconds). Default 4 hours. */
export const GUEST_TTL_SECONDS = 4 * 60 * 60;

export const GUEST_MINT_PER_IP_PER_DAY = 5;
export const GUEST_CHAT_PER_IP_PER_DAY = 20;

export const PRO_TIER = {
  aiMessagesPerWeek: 300,
  recipeImportsPerMonth: 50,
  maxRecipes: -1,
  imageUploadsPerMonth: -1,
};

export function planNameForBillingPeriod(
  billingPeriod: string | null | undefined,
): string | null {
  if (billingPeriod === 'monthly') return 'Pro Monthly';
  if (billingPeriod === 'yearly') return 'Pro Yearly';
  return null;
}
