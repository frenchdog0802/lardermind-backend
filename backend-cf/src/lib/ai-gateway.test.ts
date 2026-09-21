import { describe, expect, it } from 'vitest';
import {
  aiGatewayChatCompletionsUrl,
  DEFAULT_AI_GATEWAY_ID,
  DEFAULT_LLM_MODEL,
  resolveAiGatewayConfig,
  resolveLlmModel,
} from './ai-gateway';
import type { Env } from '../env';

function env(partial: Partial<Env>): Env {
  return partial as Env;
}

describe('ai-gateway helpers', () => {
  it('builds DeepSeek and OpenAI chat completion URLs', () => {
    const config = { accountId: 'acc123', gatewayId: 'default' };
    expect(aiGatewayChatCompletionsUrl(config, 'deepseek')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/default/deepseek/chat/completions',
    );
    expect(aiGatewayChatCompletionsUrl(config, 'openai')).toBe(
      'https://gateway.ai.cloudflare.com/v1/acc123/default/openai/chat/completions',
    );
  });

  it('resolves gateway config and defaults', () => {
    expect(resolveAiGatewayConfig(env({ CF_ACCOUNT_ID: '' }))).toBeNull();
    expect(
      resolveAiGatewayConfig(
        env({ CF_ACCOUNT_ID: 'acc', AI_GATEWAY_ID: '' }),
      ),
    ).toEqual({ accountId: 'acc', gatewayId: DEFAULT_AI_GATEWAY_ID });
    expect(resolveLlmModel(env({}))).toBe(DEFAULT_LLM_MODEL);
    expect(resolveLlmModel(env({ LLM_MODEL: 'deepseek-reasoner' }))).toBe(
      'deepseek-reasoner',
    );
  });
});
