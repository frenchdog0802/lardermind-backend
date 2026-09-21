import { nowUnixSeconds } from '../lib/time';

export type ChatSessionRow = {
  id: string;
  user_id: string;
  title: string;
  is_default: number;
  created_at: number | null;
  updated_at: number | null;
};

export type AiMessageRow = {
  id: string;
  user_id: string;
  session_id: string;
  role: string;
  content: string;
  response_type: string | null;
  card_data: string | null;
  created_at: number;
};

export type ChatSessionDto = {
  id: string;
  title: string;
  isDefault: boolean;
  updatedAt: number | null;
  createdAt: number | null;
};

export type HistoryMessageDto = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  responseType?: string;
  cardData?: Record<string, unknown>;
};

function toSessionDto(row: ChatSessionRow): ChatSessionDto {
  return {
    id: row.id,
    title: row.title,
    isDefault: row.is_default === 1,
    updatedAt: row.updated_at,
    createdAt: row.created_at,
  };
}

export async function listSessions(
  db: D1Database,
  userId: string,
): Promise<ChatSessionDto[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM chat_sessions WHERE user_id = ? ORDER BY updated_at DESC`,
    )
    .bind(userId)
    .all<ChatSessionRow>();
  return (results ?? []).map(toSessionDto);
}

export async function createSession(
  db: D1Database,
  userId: string,
  title?: string,
): Promise<ChatSessionDto> {
  const id = crypto.randomUUID();
  const now = nowUnixSeconds();
  const sessionTitle = title?.trim() || 'New chat';
  await db
    .prepare(
      `INSERT INTO chat_sessions (id, user_id, title, is_default, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`,
    )
    .bind(id, userId, sessionTitle, now, now)
    .run();
  const row = await db
    .prepare('SELECT * FROM chat_sessions WHERE id = ?')
    .bind(id)
    .first<ChatSessionRow>();
  if (!row) throw new Error('Failed to create session');
  return toSessionDto(row);
}

export async function getSessionForUser(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<ChatSessionRow | null> {
  return db
    .prepare('SELECT * FROM chat_sessions WHERE id = ? AND user_id = ?')
    .bind(sessionId, userId)
    .first<ChatSessionRow>();
}

export async function updateSessionTitle(
  db: D1Database,
  userId: string,
  sessionId: string,
  title: string,
): Promise<ChatSessionDto | null> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `UPDATE chat_sessions SET title = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
    )
    .bind(title.trim(), now, sessionId, userId)
    .run();
  const row = await getSessionForUser(db, userId, sessionId);
  return row ? toSessionDto(row) : null;
}

export async function deleteSession(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM chat_sessions WHERE id = ? AND user_id = ?')
    .bind(sessionId, userId)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function listHistory(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<HistoryMessageDto[]> {
  const { results } = await db
    .prepare(
      `SELECT * FROM ai_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at ASC`,
    )
    .bind(userId, sessionId)
    .all<AiMessageRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    role: row.role as 'user' | 'assistant',
    content: row.content,
    createdAt: row.created_at,
    ...(row.response_type ? { responseType: row.response_type } : {}),
    ...(row.card_data
      ? { cardData: JSON.parse(row.card_data) as Record<string, unknown> }
      : {}),
  }));
}

export async function insertMessage(
  db: D1Database,
  input: {
    userId: string;
    sessionId: string;
    role: 'user' | 'assistant';
    content: string;
    responseType?: string;
    cardData?: Record<string, unknown>;
  },
): Promise<void> {
  const now = nowUnixSeconds();
  await db.batch([
    db
      .prepare(
        `INSERT INTO ai_messages (id, user_id, session_id, role, content, response_type, card_data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        input.userId,
        input.sessionId,
        input.role,
        input.content,
        input.responseType ?? null,
        input.cardData ? JSON.stringify(input.cardData) : null,
        now,
      ),
    db
      .prepare(`UPDATE chat_sessions SET updated_at = ? WHERE id = ? AND user_id = ?`)
      .bind(now, input.sessionId, input.userId),
  ]);
}

export async function incrementAiUsage(db: D1Database, userId: string): Promise<void> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `UPDATE usage_quotas SET ai_message_sent = ai_message_sent + 1, updated_at = ?, ai_period_start = COALESCE(ai_period_start, ?) WHERE user_id = ?`,
    )
    .bind(now, now, userId)
    .run();
}

export async function clearHistory(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const session = await getSessionForUser(db, userId, sessionId);
  if (!session) return false;

  await db
    .prepare(
      `DELETE FROM ai_messages WHERE user_id = ? AND session_id = ?`,
    )
    .bind(userId, sessionId)
    .run();
  return true;
}

export async function getRecentMessagesForModel(
  db: D1Database,
  userId: string,
  sessionId: string,
  limit = 12,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const { results } = await db
    .prepare(
      `SELECT role, content FROM ai_messages WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .bind(userId, sessionId, limit)
    .all<{ role: string; content: string }>();

  return (results ?? [])
    .reverse()
    .map((row) => ({
      role: row.role as 'user' | 'assistant',
      content: row.content,
    }));
}
