import type { Env } from '../env';
import {
  getRecentMessagesForModel,
  incrementAiUsage,
  insertMessage,
} from '../db/chat';
import {
  aiGatewayChatCompletionsUrl,
  aiGatewayRequestHeaders,
  isAiGatewayAuthenticated,
  resolveAiGatewayConfig,
  resolveLlmModel,
} from '../lib/ai-gateway';
import { iterateOpenAiCompatStream } from '../lib/openai-compat';
import { formatSseEvent, sseResponse } from '../lib/sse';
import { COOKING_ASSISTANT_SYSTEM_PROMPT } from './system-prompt';

type StreamChatInput = {
  userId: string;
  sessionId: string;
  message: string;
};

export function streamCookingChat(env: Env, input: StreamChatInput): Response {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();

  const writeEvent = async (event: string, data: string) => {
    await writer.write(encoder.encode(formatSseEvent(event, data)));
  };

  void (async () => {
    try {
      await insertMessage(env.DB, {
        userId: input.userId,
        sessionId: input.sessionId,
        role: 'user',
        content: input.message,
      });
      await incrementAiUsage(env.DB, input.userId);

      const history = await getRecentMessagesForModel(
        env.DB,
        input.userId,
        input.sessionId,
      );
      const messages = [
        { role: 'system' as const, content: COOKING_ASSISTANT_SYSTEM_PROMPT },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ];

      await writeEvent(
        'status',
        JSON.stringify({ message: 'Thinking about your meal…' }),
      );

      const gateway = resolveAiGatewayConfig(env);
      const apiKey = (env.DEEPSEEK_API_KEY || '').trim();
      if (!isAiGatewayAuthenticated(env) || !apiKey || !gateway) {
        await writeEvent(
          'error',
          JSON.stringify({ message: 'Chat is not configured' }),
        );
        return;
      }

      const model = resolveLlmModel(env);
      const url = aiGatewayChatCompletionsUrl(gateway, 'deepseek');
      const response = await fetch(url, {
        method: 'POST',
        headers: aiGatewayRequestHeaders(env, apiKey),
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      });

      if (!response.ok || !response.body) {
        await writeEvent(
          'error',
          JSON.stringify({ message: 'Chat provider request failed' }),
        );
        return;
      }

      let fullText = '';
      for await (const token of iterateOpenAiCompatStream(response.body)) {
        if (!token) continue;
        fullText += token;
        await writeEvent('token', JSON.stringify(token));
      }

      const assistantText =
        fullText.trim() ||
        'Sorry, I could not generate a reply. Please try again.';

      await insertMessage(env.DB, {
        userId: input.userId,
        sessionId: input.sessionId,
        role: 'assistant',
        content: assistantText,
        responseType: 'text',
      });

      await writeEvent(
        'done',
        JSON.stringify({
          type: 'text',
          message: assistantText,
          data: {},
        }),
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Chat stream failed';
      await writeEvent('error', JSON.stringify({ message }));
    } finally {
      try {
        await writer.close();
      } catch {
        // already closed
      }
    }
  })();

  return sseResponse(readable);
}
