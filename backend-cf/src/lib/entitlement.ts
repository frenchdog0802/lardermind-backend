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
};

export const FREE_TIER = {
  aiMessagesPerDay: 20,
  recipeImportsPerMonth: 3,
  maxRecipes: 50,
  imageUploadsPerMonth: 10,
};

export const PRO_TIER = {
  aiMessagesPerDay: 200,
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
