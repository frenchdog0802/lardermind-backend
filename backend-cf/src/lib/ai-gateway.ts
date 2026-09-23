import type { Env } from '../env';

export const DEFAULT_AI_GATEWAY_ID = 'default';
export const DEFAULT_LLM_MODEL = 'deepseek-chat';
export const DEFAULT_VISION_MODEL = 'gpt-4o';
export const DEFAULT_VISION_TIMEOUT_MS = 60_000;

export type AiGatewayConfig = {
  accountId: string;
  gatewayId: string;
};

export function resolveAiGatewayConfig(env: Env): AiGatewayConfig | null {
  const accountId = (env.CF_ACCOUNT_ID || '').trim();
  if (!accountId) return null;
  const gatewayId =
    (env.AI_GATEWAY_ID || '').trim() || DEFAULT_AI_GATEWAY_ID;
  return { accountId, gatewayId };
}

/** Cloudflare Authenticated Gateway token (`cf-aig-authorization`). */
export function resolveAiGatewayToken(env: Env): string {
  return (env.CF_AIG_TOKEN || '').trim();
}

/**
 * Headers for provider-native AI Gateway requests.
 * Provider key stays in `Authorization`; Gateway auth uses `cf-aig-authorization`.
 */
export function aiGatewayRequestHeaders(
  env: Env,
  providerApiKey: string,
): Record<string, string> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    Authorization: `Bearer ${providerApiKey}`,
  };
  const gatewayToken = resolveAiGatewayToken(env);
  if (gatewayToken) {
    headers['cf-aig-authorization'] = `Bearer ${gatewayToken}`;
  }
  return headers;
}

/** Account + Authenticated Gateway token required for Gateway calls. */
export function isAiGatewayAuthenticated(env: Env): boolean {
  return Boolean(resolveAiGatewayConfig(env) && resolveAiGatewayToken(env));
}

export function aiGatewayProviderBaseUrl(
  config: AiGatewayConfig,
  provider: 'deepseek' | 'openai',
): string {
  return `https://gateway.ai.cloudflare.com/v1/${config.accountId}/${config.gatewayId}/${provider}`;
}

export function aiGatewayChatCompletionsUrl(
  config: AiGatewayConfig,
  provider: 'deepseek' | 'openai',
): string {
  return `${aiGatewayProviderBaseUrl(config, provider)}/chat/completions`;
}

export function resolveLlmModel(env: Env): string {
  return (env.LLM_MODEL || '').trim() || DEFAULT_LLM_MODEL;
}

export function resolveVisionModel(env: Env): string {
  return (env.OPENAI_VISION_MODEL || '').trim() || DEFAULT_VISION_MODEL;
}

export function resolveVisionTimeoutMs(env: Env): number {
  const raw = Number(env.OPENAI_VISION_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw > 0) return raw;
  return DEFAULT_VISION_TIMEOUT_MS;
}
