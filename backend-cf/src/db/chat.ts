import { nowUnixSeconds } from '../lib/time';

/** Stored default session title; also the auto-title sentinel. */
export const DEFAULT_CHAT_TITLE = 'New chat';

export type ChatSessionRow = {
  id: string;
  user_id: string;
  title: string;
  is_default: number;
  created_at: number | null;
  updated_at: number | null;
  locked_at?: number | null;
  pending_interrupt_json?: string | null;
  pending_claim_token?: string | null;
  hitl_checkpoint_json?: string | null;
};

/** Stale lock older than this is treated as free (seconds). */
export const CHAT_LOCK_STALE_SECONDS = 300;

export type PendingToolSummary = {
  name: string;
  argsSummary: string;
  id?: string;
};

export type PendingToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

export type PendingInterrupt = {
  createdAt: number;
  /** Stable id for this approval. Missing on rows created before the claim fix. */
  interruptId?: string;
  /** Unix seconds. Missing rows expire `createdAt + HITL_PENDING_TTL_SECONDS`. */
  expiresAt?: number;
  pendingTools: PendingToolSummary[];
  toolCalls: PendingToolCall[];
  messages: Array<Record<string, unknown>>;
};

/** Pending approvals older than this are treated as rejected. */
export const HITL_PENDING_TTL_SECONDS = 20 * 60;

/** A claim older than this can be closed without re-running tools. */
export const HITL_CLAIM_STALE_SECONDS = 90;

export type HitlToolResult = {
  id: string;
  name: string;
  content: string;
  cardType?: string;
  cardData?: Record<string, unknown>;
};

export type HitlCheckpoint = {
  interruptId: string;
  phase: 'results_saved' | 'complete';
  decision: 'approve' | 'reject' | 'expire';
  toolResults: HitlToolResult[];
  httpStatus: number;
  errorCode?: string;
  response?: {
    type: string;
    message: string;
    data: Record<string, unknown>;
  };
};

export function interruptIdOf(pending: PendingInterrupt): string {
  if (typeof pending.interruptId === 'string' && pending.interruptId.trim()) {
    return pending.interruptId.trim();
  }
  const tool = pending.toolCalls[0]?.id ?? 'none';
  return `legacy:${pending.createdAt}:${tool}`;
}

export function expiresAtOf(pending: PendingInterrupt): number {
  if (typeof pending.expiresAt === 'number' && Number.isFinite(pending.expiresAt)) {
    return pending.expiresAt;
  }
  return pending.createdAt + HITL_PENDING_TTL_SECONDS;
}

export function isPendingExpired(
  pending: PendingInterrupt,
  now = nowUnixSeconds(),
): boolean {
  return now >= expiresAtOf(pending);
}

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
  const sessionTitle = title?.trim() || DEFAULT_CHAT_TITLE;
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

/** Update title only while it is still the default sentinel (`New chat`). */
export async function updateSessionTitleIfDefault(
  db: D1Database,
  userId: string,
  sessionId: string,
  title: string,
): Promise<ChatSessionDto | null> {
  const now = nowUnixSeconds();
  const result = await db
    .prepare(
      `UPDATE chat_sessions SET title = ?, updated_at = ?
       WHERE id = ? AND user_id = ? AND title = ?`,
    )
    .bind(title.trim(), now, sessionId, userId, DEFAULT_CHAT_TITLE)
    .run();
  if (!result.meta.changes) return null;
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

export async function tryAcquireSessionLock(
  db: D1Database,
  userId: string,
  sessionId: string,
  now = nowUnixSeconds(),
  staleSeconds = CHAT_LOCK_STALE_SECONDS,
): Promise<boolean> {
  const staleBefore = now - staleSeconds;
  const result = await db
    .prepare(
      `UPDATE chat_sessions
       SET locked_at = ?
       WHERE id = ? AND user_id = ?
         AND (locked_at IS NULL OR locked_at < ?)`,
    )
    .bind(now, sessionId, userId, staleBefore)
    .run();
  return (result.meta.changes ?? 0) > 0;
}

export async function releaseSessionLock(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE chat_sessions SET locked_at = NULL WHERE id = ? AND user_id = ?`,
    )
    .bind(sessionId, userId)
    .run();
}

export async function setPendingInterrupt(
  db: D1Database,
  userId: string,
  sessionId: string,
  pending: PendingInterrupt,
): Promise<void> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `UPDATE chat_sessions
       SET pending_interrupt_json = ?, locked_at = ?, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(JSON.stringify(pending), now, now, sessionId, userId)
    .run();
}

export async function getPendingInterrupt(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<PendingInterrupt | null> {
  const row = await getSessionForUser(db, userId, sessionId);
  if (!row?.pending_interrupt_json) return null;
  try {
    return JSON.parse(row.pending_interrupt_json) as PendingInterrupt;
  } catch {
    return null;
  }
}

/** History-safe pending payload (tool summaries + ids; no toolCalls / LLM messages). */
export function pendingInterruptForHistory(
  pending: PendingInterrupt | null,
): {
  interruptId: string;
  expiresAt: number;
  pendingTools: PendingToolSummary[];
} | null {
  if (!pending) return null;
  return {
    interruptId: interruptIdOf(pending),
    expiresAt: expiresAtOf(pending),
    pendingTools: pending.pendingTools,
  };
}

export function parseHitlCheckpoint(raw: string | null | undefined): HitlCheckpoint | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HitlCheckpoint;
    if (!parsed || (parsed.phase !== 'results_saved' && parsed.phase !== 'complete')) {
      return null;
    }
    if (typeof parsed.interruptId !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function claimPendingInterrupt(
  db: D1Database,
  userId: string,
  sessionId: string,
  token: string,
  now = nowUnixSeconds(),
): Promise<boolean> {
  const result = await db
    .prepare(
      `UPDATE chat_sessions
       SET pending_claim_token = ?, locked_at = ?
       WHERE id = ? AND user_id = ?
         AND pending_interrupt_json IS NOT NULL
         AND pending_claim_token IS NULL`,
    )
    .bind(token, now, sessionId, userId)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function reclaimStaleHitlClaim(
  db: D1Database,
  userId: string,
  sessionId: string,
  token: string,
  now = nowUnixSeconds(),
  staleSeconds = HITL_CLAIM_STALE_SECONDS,
): Promise<boolean> {
  const staleBefore = now - staleSeconds;
  const result = await db
    .prepare(
      `UPDATE chat_sessions
       SET pending_claim_token = ?, locked_at = ?
       WHERE id = ? AND user_id = ?
         AND pending_claim_token IS NOT NULL
         AND locked_at IS NOT NULL
         AND locked_at < ?`,
    )
    .bind(token, now, sessionId, userId, staleBefore)
    .run();
  return (result.meta?.changes ?? 0) > 0;
}

export async function saveHitlResultsAndClearPending(
  db: D1Database,
  userId: string,
  sessionId: string,
  claimToken: string,
  checkpoint: HitlCheckpoint,
  now = nowUnixSeconds(),
): Promise<void> {
  await db
    .prepare(
      `UPDATE chat_sessions
       SET pending_interrupt_json = NULL,
           hitl_checkpoint_json = ?,
           locked_at = ?,
           updated_at = ?
       WHERE id = ? AND user_id = ? AND pending_claim_token = ?`,
    )
    .bind(JSON.stringify(checkpoint), now, now, sessionId, userId, claimToken)
    .run();
}

export async function finishHitlCheckpoint(
  db: D1Database,
  userId: string,
  sessionId: string,
  claimToken: string,
  checkpoint: HitlCheckpoint,
): Promise<void> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `UPDATE chat_sessions
       SET hitl_checkpoint_json = ?,
           pending_claim_token = NULL,
           locked_at = NULL,
           updated_at = ?
       WHERE id = ? AND user_id = ? AND pending_claim_token = ?`,
    )
    .bind(JSON.stringify(checkpoint), now, sessionId, userId, claimToken)
    .run();
}

/** Assistant row for a finished resume. Deterministic id so a replay does not duplicate it. */
export async function insertHitlOutcomeMessage(
  db: D1Database,
  input: {
    interruptId: string;
    userId: string;
    sessionId: string;
    content: string;
    responseType?: string;
    cardData?: Record<string, unknown>;
  },
): Promise<void> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `INSERT OR IGNORE INTO ai_messages
        (id, user_id, session_id, role, content, response_type, card_data, created_at)
       VALUES (?, ?, ?, 'assistant', ?, ?, ?, ?)`,
    )
    .bind(
      `hitl-${input.interruptId}`.slice(0, 200),
      input.userId,
      input.sessionId,
      input.content,
      input.responseType ?? null,
      input.cardData ? JSON.stringify(input.cardData) : null,
      now,
    )
    .run();
}

export async function clearPendingInterrupt(
  db: D1Database,
  userId: string,
  sessionId: string,
): Promise<void> {
  const now = nowUnixSeconds();
  await db
    .prepare(
      `UPDATE chat_sessions
       SET pending_interrupt_json = NULL, locked_at = NULL, updated_at = ?
       WHERE id = ? AND user_id = ?`,
    )
    .bind(now, sessionId, userId)
    .run();
}
