import type { Env } from '../env';
import {
  DEFAULT_CHAT_TITLE,
  getSessionForUser,
  updateSessionTitleIfDefault,
  type ChatSessionDto,
} from '../db/chat';
import { completeChat } from '../lib/llm-chat';

export { DEFAULT_CHAT_TITLE };
export const AUTO_TITLE_MAX_CHARS = 60;
export const AUTO_TITLE_FALLBACK_MAX_CHARS = 48;
export const AUTO_TITLE_INPUT_MAX_CHARS = 500;
export const AUTO_TITLE_MAX_TOKENS = 24;

export function sanitizeTitle(raw: string): string | null {
  let title = raw.trim();
  if (!title) return null;

  const firstLine = title.split(/\r?\n/)[0] ?? '';
  title = firstLine.trim();
  if (
    (title.startsWith('"') && title.endsWith('"')) ||
    (title.startsWith("'") && title.endsWith("'"))
  ) {
    title = title.slice(1, -1).trim();
  }
  title = title.replace(/\s+/g, ' ').trim();
  if (!title) return null;

  if (title.length > AUTO_TITLE_MAX_CHARS) {
    const sliced = title.slice(0, AUTO_TITLE_MAX_CHARS);
    const lastSpace = sliced.lastIndexOf(' ');
    title =
      lastSpace > AUTO_TITLE_MAX_CHARS * 0.5
        ? sliced.slice(0, lastSpace).trim()
        : sliced.trim();
  }

  if (!title || title === DEFAULT_CHAT_TITLE) return null;
  return title;
}

export function fallbackTitleFromMessage(message: string): string | null {
  const collapsed = message.replace(/\s+/g, ' ').trim();
  if (!collapsed) return null;

  if (collapsed.length <= AUTO_TITLE_FALLBACK_MAX_CHARS) {
    return sanitizeTitle(collapsed);
  }

  const sliced = collapsed.slice(0, AUTO_TITLE_FALLBACK_MAX_CHARS - 1);
  const lastSpace = sliced.lastIndexOf(' ');
  const base =
    lastSpace > AUTO_TITLE_FALLBACK_MAX_CHARS * 0.5
      ? sliced.slice(0, lastSpace).trim()
      : sliced.trim();
  if (!base) return null;
  return sanitizeTitle(`${base}…`);
}

function buildTitleMessages(userMessage: string) {
  const clipped = userMessage.slice(0, AUTO_TITLE_INPUT_MAX_CHARS);
  return [
    {
      role: 'system' as const,
      content:
        'You name chat threads for a cooking and pantry assistant. Reply with ONLY a short title (about 3–8 words). No quotes, no trailing punctuation spam, no emoji unless present in the user text. Capture the topic or intent. Match the user’s language (Chinese or English).',
    },
    {
      role: 'user' as const,
      content: clipped,
    },
  ];
}

export type MaybeAutoTitleResult = { title: string; session: ChatSessionDto };

/**
 * If the session title is still the default sentinel, generate and persist a short title.
 * Never throws for LLM/DB soft failures — returns null instead.
 */
export async function maybeAutoTitleSession(input: {
  env: Env;
  db: D1Database;
  userId: string;
  sessionId: string;
  userMessage: string;
  completeChatFn?: typeof completeChat;
}): Promise<MaybeAutoTitleResult | null> {
  const userMessage = input.userMessage.trim();
  if (!userMessage) return null;

  try {
    const session = await getSessionForUser(
      input.db,
      input.userId,
      input.sessionId,
    );
    if (!session || session.title !== DEFAULT_CHAT_TITLE) return null;

    const chatFn = input.completeChatFn ?? completeChat;
    let candidate: string | null = null;
    try {
      const result = await chatFn({
        env: input.env,
        messages: buildTitleMessages(userMessage),
        maxTokens: AUTO_TITLE_MAX_TOKENS,
      });
      candidate = sanitizeTitle(result.content ?? '');
    } catch {
      candidate = null;
    }

    if (!candidate) {
      candidate = fallbackTitleFromMessage(userMessage);
    }
    if (!candidate) return null;

    const updated = await updateSessionTitleIfDefault(
      input.db,
      input.userId,
      input.sessionId,
      candidate,
    );
    if (!updated) return null;
    return { title: updated.title, session: updated };
  } catch {
    return null;
  }
}
