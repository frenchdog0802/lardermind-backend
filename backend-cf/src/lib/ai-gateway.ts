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
