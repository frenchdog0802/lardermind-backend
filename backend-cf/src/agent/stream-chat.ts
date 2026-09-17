import type { Env } from '../env';
import {
  getRecentMessagesForModel,
  incrementAiUsage,
  insertMessage,
} from '../db/chat';
import { formatSseEvent, sseResponse } from '../lib/sse';
import { COOKING_ASSISTANT_SYSTEM_PROMPT } from './system-prompt';

type StreamChatInput = {
  userId: string;
  sessionId: string;
  message: string;
};

function extractTokenText(chunk: string): string {
  if (!chunk) return '';
  try {
    const parsed = JSON.parse(chunk) as { response?: string; content?: string };
    if (typeof parsed.response === 'string') return parsed.response;
    if (typeof parsed.content === 'string') return parsed.content;
  } catch {
    // Workers AI may stream raw text.
  }
  return chunk;
}

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

      const model = env.AI_MODEL || '@cf/meta/llama-3.1-8b-instruct';
      const aiStream = await env.AI.run(model, {
        messages,
        stream: true,
      });

      let fullText = '';
      const reader = aiStream.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const token = extractTokenText(chunk);
        if (!token) continue;
        fullText += token;
        await writeEvent('token', JSON.stringify(token));
      }

      const assistantText =
        fullText.trim() || 'Sorry, I could not generate a reply. Please try again.';

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
