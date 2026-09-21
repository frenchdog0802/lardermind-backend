import { Hono } from 'hono';
import { ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';

const PLANS = [
  {
    name: 'Pro Monthly',
    billingPeriod: 'monthly',
    priceCents: 499,
    currency: 'USD',
    priceDisplay: '$4.99/mo',
    productIdIos: 'com.lardermind.pro.monthly',
    productIdAndroid: 'pantry_pro_monthly',
  },
  {
    name: 'Pro Yearly',
    billingPeriod: 'yearly',
    priceCents: 3999,
    currency: 'USD',
    priceDisplay: '$39.99/yr',
    productIdIos: 'com.lardermind.pro.yearly',
    productIdAndroid: 'pantry_pro_yearly',
  },
];

const FREE_TIER = {
  aiMessagesPerDay: 20,
  recipeImportsPerMonth: 3,
  maxRecipes: 50,
  imageUploadsPerMonth: 10,
};

const PRO_TIER = {
  aiMessagesPerDay: 200,
  recipeImportsPerMonth: 50,
  maxRecipes: -1,
  imageUploadsPerMonth: -1,
};

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
      trialDays: 7,
      stripeCheckoutEnabled: false,
    }),
  ),
);

subscriptionRoutes.get('/api/subscription/status', requireAuth, async (c) => {
  const userId = c.get('userId');
  const quota = await c.env.DB.prepare(
    'SELECT ai_message_sent, image_uploads FROM usage_quotas WHERE user_id = ?',
  )
    .bind(userId)
    .first<{ ai_message_sent: number; image_uploads: number }>();

  const aiUsed = quota?.ai_message_sent ?? 0;
  const imageUsed = quota?.image_uploads ?? 0;

  return c.json(
    ok({
      isPro: false,
      isTrial: false,
      usage: {
        aiMessagesUsed: aiUsed,
        aiMessagesLimit: FREE_TIER.aiMessagesPerDay,
        recipeImportsUsed: 0,
        recipeImportsLimit: FREE_TIER.recipeImportsPerMonth,
        recipeCount: 0,
        recipeLimit: FREE_TIER.maxRecipes,
        imageUploadsUsed: imageUsed,
        imageUploadsLimit: FREE_TIER.imageUploadsPerMonth,
      },
    }),
  );
});
