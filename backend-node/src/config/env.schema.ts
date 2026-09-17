import { z } from 'zod';
import {
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_PORT,
  JWT_SECRET_MIN_LENGTH,
  SUBSCRIPTION_DEFAULTS,
  type SubscriptionConfig,
} from './env.constants';

const emptyToUndefined = (value: unknown): unknown =>
  value === '' || value === undefined ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

const optionalInt = (fallback: number) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional().default(fallback),
  );

export const envSchema = z.object({
  // Node-only
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),

  // Server (Spring PORT; Nest default differs to avoid Expo/Spring clash)
  PORT: z.coerce.number().int().positive().default(DEFAULT_PORT),

  // Database
  DB_HOST: z.string().min(1, 'DB_HOST is required'),
  DB_PORT: z.coerce.number().int().positive(),
  DB_NAME: z.string().min(1, 'DB_NAME is required'),
  DB_USERNAME: z.string().min(1, 'DB_USERNAME is required'),
  DB_PASSWORD: z.string().min(1, 'DB_PASSWORD is required'),
  DB_SSL_MODE: z.string().min(1, 'DB_SSL_MODE is required'),
  DB_POOL_SIZE: optionalInt(2),
  DB_POOL_MIN_IDLE: optionalInt(1),

  // Auth
  JWT_SECRET: z
    .string()
    .min(
      JWT_SECRET_MIN_LENGTH,
      `JWT_SECRET must be at least ${JWT_SECRET_MIN_LENGTH} characters (HS256)`,
    ),
  JWT_EXPIRES_IN_SECONDS: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .int()
      .positive()
      .optional()
      .default(DEFAULT_JWT_EXPIRES_IN_SECONDS),
  ),
  // Present for Wave 1; empty disables Google until configured (Spring same pattern)
  GOOGLE_CLIENT_ID: z.string().default(''),

  FRONTEND_URL: z.string().url('FRONTEND_URL must be a valid URL'),
  CORS_ALLOWED_ORIGINS: z.string().min(1, 'CORS_ALLOWED_ORIGINS is required'),

  // Optional Wave 2+ (declared for inheritance; not required to boot)
  CLOUDINARY_CLOUD_NAME: optionalString,
  CLOUDINARY_API_KEY: optionalString,
  CLOUDINARY_API_SECRET: optionalString,
  DEEPSEEK_API_KEY: optionalString,
  LLM_BASE_URL: optionalString,
  LLM_MODEL: optionalString,
  LLM_TEMPERATURE: z.preprocess(emptyToUndefined, z.coerce.number().optional()),
  LLM_MAX_TOKENS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().optional(),
  ),
  OPENAI_API_KEY: optionalString,
  OPENAI_VISION_MODEL: optionalString,
  OPENAI_VISION_TIMEOUT_MS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  STRIPE_SECRET_KEY: optionalString,
  STRIPE_WEBHOOK_SECRET: optionalString,
  STRIPE_PRICE_MONTHLY: optionalString,
  STRIPE_PRICE_YEARLY: optionalString,
  UNSPLASH_ACCESS_KEY: optionalString,
  YOUTUBE_API_KEY: optionalString,
  SOCIAL_IMPORT_API_KEY: optionalString,
  SOCIAL_IMPORT_BASE_URL: optionalString,

  // Chat / LangGraph
  CHAT_HITL_ENABLED: z.preprocess((value) => {
    if (value === '' || value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return value;
  }, z.boolean().optional()),
  CHAT_RECURSION_LIMIT: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  CHAT_TURN_TOOL_ROUNDS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().optional(),
  ),
  CHAT_USE_MEMORY_CHECKPOINTER: z.preprocess((value) => {
    if (value === '' || value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      if (lower === 'true' || lower === '1') return true;
      if (lower === 'false' || lower === '0') return false;
    }
    return value;
  }, z.boolean().optional()),
});

export type EnvVars = z.infer<typeof envSchema>;

export type AppConfig = {
  nodeEnv: EnvVars['NODE_ENV'];
  port: number;
  database: {
    host: string;
    port: number;
    name: string;
    username: string;
    password: string;
    sslMode: string;
    poolSize: number;
    poolMinIdle: number;
  };
  jwtSecret: string;
  jwtExpiresInSeconds: number;
  googleClientId: string;
  frontendUrl: string;
  corsAllowedOrigins: string[];
  subscription: SubscriptionConfig;
  optional: {
    cloudinaryCloudName?: string;
    cloudinaryApiKey?: string;
    cloudinaryApiSecret?: string;
    deepseekApiKey?: string;
    llmBaseUrl?: string;
    llmModel?: string;
    llmTemperature?: number;
    llmMaxTokens?: number;
    openaiApiKey?: string;
    openaiVisionModel?: string;
    openaiVisionTimeoutMs?: number;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    stripePriceMonthly?: string;
    stripePriceYearly?: string;
    unsplashAccessKey?: string;
    youtubeApiKey?: string;
    socialImportApiKey?: string;
    socialImportBaseUrl?: string;
    chatHitlEnabled: boolean;
    chatRecursionLimit: number;
    chatTurnToolRounds: number;
    chatUseMemoryCheckpointer: boolean;
  };
};

export function parseEnv(raw: Record<string, unknown>): EnvVars {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}

export function toAppConfig(env: EnvVars): AppConfig {
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    database: {
      host: env.DB_HOST,
      port: env.DB_PORT,
      name: env.DB_NAME,
      username: env.DB_USERNAME,
      password: env.DB_PASSWORD,
      sslMode: env.DB_SSL_MODE,
      poolSize: env.DB_POOL_SIZE,
      poolMinIdle: env.DB_POOL_MIN_IDLE,
    },
    jwtSecret: env.JWT_SECRET,
    jwtExpiresInSeconds: env.JWT_EXPIRES_IN_SECONDS,
    googleClientId: env.GOOGLE_CLIENT_ID,
    frontendUrl: env.FRONTEND_URL,
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS.split(',')
      .map((origin) => origin.trim())
      .filter((origin) => origin.length > 0),
    subscription: {
      ...SUBSCRIPTION_DEFAULTS,
      plans: SUBSCRIPTION_DEFAULTS.plans.map((plan, index) => ({
        ...plan,
        stripePriceId:
          index === 0 ? env.STRIPE_PRICE_MONTHLY : env.STRIPE_PRICE_YEARLY,
      })),
    },
    optional: {
      cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME,
      cloudinaryApiKey: env.CLOUDINARY_API_KEY,
      cloudinaryApiSecret: env.CLOUDINARY_API_SECRET,
      deepseekApiKey: env.DEEPSEEK_API_KEY,
      llmBaseUrl: env.LLM_BASE_URL,
      llmModel: env.LLM_MODEL,
      llmTemperature: env.LLM_TEMPERATURE,
      llmMaxTokens: env.LLM_MAX_TOKENS,
      openaiApiKey: env.OPENAI_API_KEY,
      openaiVisionModel: env.OPENAI_VISION_MODEL,
      openaiVisionTimeoutMs: env.OPENAI_VISION_TIMEOUT_MS,
      stripeSecretKey: env.STRIPE_SECRET_KEY,
      stripeWebhookSecret: env.STRIPE_WEBHOOK_SECRET,
      stripePriceMonthly: env.STRIPE_PRICE_MONTHLY,
      stripePriceYearly: env.STRIPE_PRICE_YEARLY,
      unsplashAccessKey: env.UNSPLASH_ACCESS_KEY,
      youtubeApiKey: env.YOUTUBE_API_KEY,
      socialImportApiKey: env.SOCIAL_IMPORT_API_KEY,
      socialImportBaseUrl: env.SOCIAL_IMPORT_BASE_URL,
      chatHitlEnabled: env.CHAT_HITL_ENABLED ?? env.NODE_ENV !== 'test',
      chatRecursionLimit: env.CHAT_RECURSION_LIMIT ?? 12,
      chatTurnToolRounds: env.CHAT_TURN_TOOL_ROUNDS ?? 3,
      chatUseMemoryCheckpointer:
        env.CHAT_USE_MEMORY_CHECKPOINTER ?? env.NODE_ENV === 'test',
    },
  };
}

/** Nest ConfigModule `validate` hook — throws on invalid/missing required vars. */
export function validateEnv(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const env = parseEnv(config);
  return { ...config, ...env, app: toAppConfig(env) };
}
