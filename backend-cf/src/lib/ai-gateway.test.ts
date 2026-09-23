import { describe, expect, it } from 'vitest';
import {
  aiGatewayChatCompletionsUrl,
  aiGatewayRequestHeaders,
  DEFAULT_AI_GATEWAY_ID,
  DEFAULT_LLM_MODEL,
  isAiGatewayAuthenticated,
  resolveAiGatewayConfig,
  resolveAiGatewayToken,
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

  it('builds provider + Authenticated Gateway headers', () => {
    expect(
      aiGatewayRequestHeaders(env({ CF_AIG_TOKEN: '' }), 'sk-provider'),
    ).toEqual({
      'content-type': 'application/json',
      Authorization: 'Bearer sk-provider',
    });
    expect(
      aiGatewayRequestHeaders(
        env({ CF_AIG_TOKEN: ' cf-token ' }),
        'sk-provider',
      ),
    ).toEqual({
      'content-type': 'application/json',
      Authorization: 'Bearer sk-provider',
      'cf-aig-authorization': 'Bearer cf-token',
    });
  });

  it('requires account id and CF_AIG_TOKEN for authenticated Gateway', () => {
    expect(
      isAiGatewayAuthenticated(
        env({ CF_ACCOUNT_ID: 'acc', CF_AIG_TOKEN: '' }),
      ),
    ).toBe(false);
    expect(
      isAiGatewayAuthenticated(
        env({ CF_ACCOUNT_ID: 'acc', CF_AIG_TOKEN: 'tok' }),
      ),
    ).toBe(true);
    expect(resolveAiGatewayToken(env({ CF_AIG_TOKEN: '  x  ' }))).toBe('x');
  });
});
