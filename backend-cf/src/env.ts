export type Env = {
  DB: D1Database;
  AI: Ai;
  R2: R2Bucket;
  JWT_SECRET: string;
  CORS_ALLOWED_ORIGINS: string;
  /** @deprecated Workers AI model; chat now uses DeepSeek via AI Gateway. */
  AI_MODEL?: string;
  JWT_EXPIRES_IN_SECONDS: string;
  /** Web OAuth Client ID — ID token audience (same as VITE_GOOGLE_CLIENT_ID). */
  GOOGLE_CLIENT_ID: string;
  /** SPA origin for Google redirect callback (no trailing slash). */
  FRONTEND_URL: string;
  /** Cloudflare account id for AI Gateway URLs. */
  CF_ACCOUNT_ID: string;
  /** AI Gateway id (default gateway is usually `default`). */
  AI_GATEWAY_ID: string;
  /**
   * Cloudflare AI Gateway auth token for Authenticated Gateway
   * (`cf-aig-authorization` header). Required when auth is enabled on the gateway.
   */
  CF_AIG_TOKEN?: string;
  /** DeepSeek API key (Bearer to AI Gateway deepseek provider). */
  DEEPSEEK_API_KEY?: string;
  /** DeepSeek chat model id (non-thinking). */
  LLM_MODEL?: string;
  /** DeepSeek planner model id for meal-plan turns (thinking enabled). */
  LLM_PLANNER_MODEL?: string;
  /** Max agent tool rounds per turn (default 8). */
  CHAT_RECURSION_LIMIT?: string;
  /** OpenAI API key for pantry vision. */
  OPENAI_API_KEY?: string;
  OPENAI_VISION_MODEL?: string;
  OPENAI_VISION_TIMEOUT_MS?: string;
  /** Stripe secret key (`sk_test_…` / `sk_live_…`). */
  STRIPE_SECRET_KEY?: string;
  /** Stripe webhook signing secret (`whsec_…`). */
  STRIPE_WEBHOOK_SECRET?: string;
  /** Stripe Price ID for Pro monthly. */
  STRIPE_PRICE_MONTHLY?: string;
  /** Stripe Price ID for Pro yearly. */
  STRIPE_PRICE_YEARLY?: string;
  /** iOS bundle id accepted in Apple signed transactions (default com.lardermind.app). */
  APPLE_BUNDLE_ID?: string;
  /** Comma list of accepted App Store environments (default "Production,Sandbox"). */
  APPLE_ALLOWED_ENVIRONMENTS?: string;
  /** Resend API key (secret). Mail no-ops (logged) when unset. */
  RESEND_API_KEY?: string;
  /** Verified sender, e.g. `LarderMind <no-reply@lardermind.com>`. Mail no-ops when unset. */
  MAIL_FROM?: string;
};
