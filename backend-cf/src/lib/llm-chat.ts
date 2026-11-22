import type { Env } from '../env';
import {
  aiGatewayChatCompletionsUrl,
  aiGatewayRequestHeaders,
  isAiGatewayAuthenticated,
  resolveAiGatewayConfig,
  resolveLlmModel,
  resolvePlannerModel,
} from './ai-gateway';

export type LlmMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
  name?: string;
  /**
   * DeepSeek thinking-mode chain of thought. Never shown to users; only echoed back to
   * the API (required when thinking mode runs tool calls).
   */
  reasoning_content?: string;
};

/** `chat` = deepseek-flash non-thinking; `planner` = deepseek-v4-pro thinking. */
export type LlmProfile = 'chat' | 'planner';

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

function stripReasoning(messages: LlmMessage[]): LlmMessage[] {
  return messages.map((m) => {
    if (m.reasoning_content === undefined) return m;
    const { reasoning_content: _drop, ...rest } = m;
    return rest;
  });
}

export async function completeChat(input: {
  env: Env;
  messages: LlmMessage[];
  tools?: LlmToolDefinition[];
  /** OpenAI-compatible tool_choice; defaults to auto when tools are present. */
  toolChoice?: 'auto' | 'required';
  /** Optional OpenAI-compatible max_tokens (e.g. short auto-title calls). */
  maxTokens?: number;
  /** Model profile; defaults to `chat`. */
  profile?: LlmProfile;
}): Promise<ChatCompletionResult> {
  const gateway = resolveAiGatewayConfig(input.env);
  const apiKey = (input.env.DEEPSEEK_API_KEY || '').trim();
  if (!isAiGatewayAuthenticated(input.env) || !apiKey || !gateway) {
    throw new Error('Chat is not configured');
  }

  const url = aiGatewayChatCompletionsUrl(gateway, 'deepseek');
  const send = (profile: LlmProfile, messages: LlmMessage[]) => {
    const planner = profile === 'planner';
    const body: Record<string, unknown> = {
      model: planner ? resolvePlannerModel(input.env) : resolveLlmModel(input.env),
      messages,
      stream: false,
      // DeepSeek enables thinking by default, so chat must opt out explicitly.
      thinking: { type: planner ? 'enabled' : 'disabled' },
    };
    if (planner) body.reasoning_effort = 'high';
    if (input.maxTokens != null && Number.isFinite(input.maxTokens) && input.maxTokens > 0) {
      body.max_tokens = Math.floor(input.maxTokens);
    }
    if (input.tools?.length) {
      body.tools = input.tools;
      body.tool_choice = input.toolChoice ?? 'auto';
    }
    return fetch(url, {
      method: 'POST',
      headers: aiGatewayRequestHeaders(input.env, apiKey),
      body: JSON.stringify(body),
    });
  };

  const profile = input.profile ?? 'chat';
  let response: Response;
  if (profile === 'planner') {
    // Planner trouble (e.g. 400 for history lacking reasoning_content, outage)
    // must not break the chat: retry once on the chat model.
    try {
      response = await send('planner', input.messages);
    } catch {
      response = new Response(null, { status: 599 });
    }
    if (!response.ok) {
      response = await send('chat', stripReasoning(input.messages));
    }
  } else {
    response = await send('chat', stripReasoning(input.messages));
  }

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
  if (profile === 'planner' && typeof message.reasoning_content === 'string' && message.reasoning_content) {
    rawAssistantMessage.reasoning_content = message.reasoning_content;
  }
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
