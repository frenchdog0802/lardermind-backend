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
  /** DeepSeek API key (Bearer to AI Gateway deepseek provider). */
  DEEPSEEK_API_KEY?: string;
  /** DeepSeek model id. */
  LLM_MODEL?: string;
  /** OpenAI API key for pantry vision. */
  OPENAI_API_KEY?: string;
  OPENAI_VISION_MODEL?: string;
  OPENAI_VISION_TIMEOUT_MS?: string;
};
