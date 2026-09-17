export type Env = {
  DB: D1Database;
  AI: Ai;
  R2?: R2Bucket;
  JWT_SECRET: string;
  CORS_ALLOWED_ORIGINS: string;
  AI_MODEL: string;
  JWT_EXPIRES_IN_SECONDS: string;
  GOOGLE_CLIENT_ID?: string;
};
