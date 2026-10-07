import type { Env } from '../env';
import { formatSseEvent, sseResponse } from '../lib/sse';
import { runAgentTurn } from './agent-loop';
import { maybeAutoTitleSession } from './auto-title';

type StreamChatInput = {
  userId: string;
  sessionId: string;
  message: string;
};

function chunkText(text: string, size = 24): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks;
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
      await writeEvent(
        'status',
        JSON.stringify({ message: 'Thinking about your meal…' }),
      );

      const turn = await runAgentTurn(env, {
        userId: input.userId,
        sessionId: input.sessionId,
        message: input.message,
      });

      if (turn.kind === 'busy' || turn.kind === 'error' || turn.kind === 'quota') {
        await writeEvent(
          'error',
          JSON.stringify({ message: turn.message }),
        );
        return;
      }

      try {
        const titled = await maybeAutoTitleSession({
          env,
          db: env.DB,
          userId: input.userId,
          sessionId: input.sessionId,
          userMessage: input.message,
        });
        if (titled) {
          await writeEvent(
            'session_title',
            JSON.stringify({
              sessionId: input.sessionId,
              title: titled.title,
            }),
          );
        }
      } catch {
        // Title failures must not block the chat turn.
      }

      if (turn.kind === 'interrupt') {
        await writeEvent(
          'interrupt',
          JSON.stringify({
            type: 'interrupt',
            message: turn.message,
            data: turn.data,
          }),
        );
        return;
      }

      for (const token of chunkText(turn.response.message)) {
        await writeEvent('token', JSON.stringify(token));
      }

      await writeEvent(
        'done',
        JSON.stringify({
          type: turn.response.type,
          message: turn.response.message,
          data: turn.response.data,
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
