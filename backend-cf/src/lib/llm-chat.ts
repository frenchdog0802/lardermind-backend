import type { Env } from '../env';
import {
  aiGatewayChatCompletionsUrl,
  aiGatewayRequestHeaders,
  isAiGatewayAuthenticated,
  resolveAiGatewayConfig,
  resolveLlmModel,
} from './ai-gateway';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
};

export type LlmToolCall = {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
};

export type LlmToolDefinition = {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ParsedToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type ChatCompletionResult = {
  content: string;
  toolCalls: ParsedToolCall[];
  rawAssistantMessage: LlmMessage;
};

function parseArgs(raw: string): Record<string, unknown> {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

export function parseToolCallsFromMessage(
  message: Record<string, unknown> | undefined,
): ParsedToolCall[] {
  if (!message) return [];
  const toolCalls = message.tool_calls;
  if (!Array.isArray(toolCalls)) return [];
  const out: ParsedToolCall[] = [];
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== 'object') continue;
    const obj = tc as {
      id?: string;
      function?: { name?: string; arguments?: string };
    };
    const name = obj.function?.name?.trim();
    if (!name) continue;
    out.push({
      id: obj.id?.trim() || crypto.randomUUID(),
      name,
      arguments: parseArgs(obj.function?.arguments ?? '{}'),
    });
  }
  return out;
}

export async function completeChat(input: {
  env: Env;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
}): Promise<ChatCompletionResult> {
  const gateway = resolveAiGatewayConfig(input.env);
  const apiKey = (input.env.DEEPSEEK_API_KEY || '').trim();
  if (!isAiGatewayAuthenticated(input.env) || !apiKey || !gateway) {
    throw new Error('Chat is not configured');
  }

  const url = aiGatewayChatCompletionsUrl(gateway, 'deepseek');
  const body: Record<string, unknown> = {
    model: resolveLlmModel(input.env),
    messages: input.messages,
    stream: false,
  };
  if (input.tools?.length) {
    body.tools = input.tools;
    body.tool_choice = 'auto';
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: aiGatewayRequestHeaders(input.env, apiKey),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Chat provider request failed (${response.status})`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: Record<string, unknown> }>;
  };
  const message = json.choices?.[0]?.message ?? {};
  const content =
    typeof message.content === 'string' ? message.content : '';
  const toolCalls = parseToolCallsFromMessage(message);

  const rawAssistantMessage: LlmMessage = {
    role: 'assistant',
    content: content || null,
  };
  if (toolCalls.length) {
    rawAssistantMessage.tool_calls = toolCalls.map((tc) => ({
      id: tc.id,
      type: 'function' as const,
      function: {
        name: tc.name,
        arguments: JSON.stringify(tc.arguments),
      },
    }));
  }

  return { content, toolCalls, rawAssistantMessage };
}
