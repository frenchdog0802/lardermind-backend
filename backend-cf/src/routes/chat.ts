import { Hono, type Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ok, fail } from '../lib/api-response';
import { ErrorCodes } from '../lib/error-codes';
import { parseJsonBody } from '../lib/validate';
import { chatResumeBodySchema, chatSendBodySchema } from '../schemas/chat';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { clientIp, requireAuth } from '../middleware/auth';
import { assertGuestChatIpAllowed } from '../db/guests';

type ChatContext = Context<{ Bindings: Env; Variables: AuthVariables }>;
import {
  clearHistory,
  createSession,
  deleteSession,
  getSessionForUser,
  listHistory,
  listHistoryPage,
  listSessions,
  listSessionsPage,
  pendingInterruptForHistory,
  pendingInterruptFromSession,
  updateSessionTitle,
} from '../db/chat';
import { streamCookingChat } from '../agent/stream-chat';
import { resumeAgentTurn, runAgentTurn } from '../agent/agent-loop';
import { maybeAutoTitleSession } from '../agent/auto-title';
import { listToolNames } from '../agent/tools/definitions';

function optionalClientLocalDate(
  value: unknown,
): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) ? trimmed : undefined;
}

export const chatRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

chatRoutes.use('/api/chat/*', requireAuth);

const MAX_CHAT_PAGE = 200;

/** Optional `limit` + `before` (id cursor). Both absent => null (everything, as before). */
function parseCursorPage(
  limitRaw: string | undefined,
  beforeRaw: string | undefined,
): { ok: true; value: { limit: number; before?: string } | null } | { ok: false; message: string } {
  const before = beforeRaw?.trim() || undefined;
  if (limitRaw === undefined && !before) return { ok: true, value: null };
  let limit = MAX_CHAT_PAGE;
  if (limitRaw !== undefined) {
    const n = Number(limitRaw);
    if (!Number.isInteger(n) || n < 1) return { ok: false, message: 'Invalid limit' };
    limit = Math.min(n, MAX_CHAT_PAGE);
  }
  return { ok: true, value: { limit, ...(before ? { before } : {}) } };
}

chatRoutes.get('/api/chat/sessions', async (c) => {
  const userId = c.get('userId');
  const page = parseCursorPage(c.req.query('limit'), c.req.query('before'));
  if (!page.ok) return c.json(fail(page.message), 400);
  if (page.value) {
    const { sessions, hasMore, nextBefore } = await listSessionsPage(c.env.DB, userId, page.value);
    return c.json(ok({ sessions, hasMore, nextBefore }));
  }
  const sessions = await listSessions(c.env.DB, userId);
  return c.json(ok({ sessions }));
});

chatRoutes.post('/api/chat/sessions', async (c) => {
  const userId = c.get('userId');
  const body = (await c.req.json<{ title?: string }>().catch(() => ({}))) as {
    title?: string;
  };
  const session = await createSession(c.env.DB, userId, body.title);
  return c.json(ok(session));
});

chatRoutes.patch('/api/chat/sessions/:id', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const body = await c.req.json<{ title?: string }>();
  if (!body.title?.trim()) {
    return c.json(fail('Title is required'), 400);
  }
  const updated = await updateSessionTitle(
    c.env.DB,
    userId,
    sessionId,
    body.title,
  );
  if (!updated) return c.json(fail('Session not found'), 404);
  return c.json(ok(updated));
});

chatRoutes.delete('/api/chat/sessions/:id', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.param('id');
  const deleted = await deleteSession(c.env.DB, userId, sessionId);
  return c.json(ok({ deleted }));
});

chatRoutes.get('/api/chat/history', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json(fail('sessionId is required'), 400);
  }
  const page = parseCursorPage(c.req.query('limit'), c.req.query('before'));
  if (!page.ok) return c.json(fail(page.message), 400);
  // Independent reads run together; the session row also carries the pending interrupt.
  type HistoryRead = {
    messages: Awaited<ReturnType<typeof listHistory>>;
    hasMore?: boolean;
    nextBefore?: string | null;
  };
  const historyRead: Promise<HistoryRead> = page.value
    ? listHistoryPage(c.env.DB, userId, sessionId, page.value)
    : listHistory(c.env.DB, userId, sessionId).then((messages) => ({ messages }));
  const [session, history] = await Promise.all([
    getSessionForUser(c.env.DB, userId, sessionId),
    historyRead,
  ]);
  if (!session) return c.json(fail('Session not found'), 404);
  const pendingInterrupt = pendingInterruptForHistory(pendingInterruptFromSession(session));
  return c.json(
    ok({
      sessionId,
      messages: history.messages,
      ...(history.hasMore !== undefined
        ? { hasMore: history.hasMore, nextBefore: history.nextBefore ?? null }
        : {}),
      ...(pendingInterrupt ? { pendingInterrupt } : {}),
    }),
  );
});

chatRoutes.delete('/api/chat/history', async (c) => {
  const userId = c.get('userId');
  const sessionId = c.req.query('sessionId');
  if (!sessionId) {
    return c.json(fail('sessionId is required'), 400);
  }
  const cleared = await clearHistory(c.env.DB, userId, sessionId);
  if (!cleared) return c.json(fail('Session not found'), 404);
  return c.json(ok({ cleared: true }));
});

chatRoutes.get('/api/chat/actions', async (c) => {
  return c.json(
    ok({
      actions: listToolNames(),
      description: 'Cooking assistant tools available on CF API',
    }),
  );
});

async function enforceGuestChatIp(c: ChatContext): Promise<Response | null> {
  if (!c.get('isGuest')) return null;
  try {
    await assertGuestChatIpAllowed(c.env.DB, clientIp(c));
    return null;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Guest chat rate limit exceeded';
    return c.json(
      { success: false, message, code: 'guest_chat_rate_limited' },
      429,
    );
  }
}

chatRoutes.post('/api/chat/stream', async (c) => {
  const userId = c.get('userId');
  const rateLimited = await enforceGuestChatIp(c);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonBody(c, chatSendBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const body = parsed.data;
  if (!body.message?.trim()) {
    return c.json(fail('message is required', ErrorCodes.VALIDATION_ERROR), 400);
  }

  let sessionId = body.sessionId;
  if (sessionId) {
    const session = await getSessionForUser(c.env.DB, userId, sessionId);
    if (!session) return c.json(fail('Session not found', ErrorCodes.NOT_FOUND), 404);
  } else {
    const created = await createSession(c.env.DB, userId);
    sessionId = created.id;
  }

  return streamCookingChat(c.env, {
    userId,
    sessionId,
    message: body.message.trim(),
    clientLocalDate: optionalClientLocalDate(body.clientLocalDate),
    isGuest: c.get('isGuest'),
    language: body.language,
  });
});

chatRoutes.post('/api/chat/send', async (c) => {
  const userId = c.get('userId');
  const rateLimited = await enforceGuestChatIp(c);
  if (rateLimited) return rateLimited;

  const parsed = await parseJsonBody(c, chatSendBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const body = parsed.data;
  if (!body.message?.trim()) {
    return c.json(fail('message is required', ErrorCodes.VALIDATION_ERROR), 400);
  }

  let sessionId = body.sessionId;
  if (sessionId) {
    const session = await getSessionForUser(c.env.DB, userId, sessionId);
    if (!session) return c.json(fail('Session not found', ErrorCodes.NOT_FOUND), 404);
  } else {
    const created = await createSession(c.env.DB, userId);
    sessionId = created.id;
  }

  const turn = await runAgentTurn(c.env, {
    userId,
    sessionId,
    message: body.message.trim(),
    clientLocalDate: optionalClientLocalDate(body.clientLocalDate),
    isGuest: c.get('isGuest'),
    language: body.language,
  });

  if (turn.kind === 'busy') {
    return c.json(fail(turn.message), 409);
  }
  if (turn.kind === 'quota') {
    return c.json(fail(turn.message), 403);
  }
  if (turn.kind === 'error') {
    return c.json(fail(turn.message), 500);
  }

  if (turn.kind === 'interrupt') {
    return c.json(
      ok({
        type: 'interrupt',
        message: turn.message,
        data: turn.data,
      }),
    );
  }

  let autoTitle: string | undefined;
  try {
    const titled = await maybeAutoTitleSession({
      env: c.env,
      db: c.env.DB,
      userId,
      sessionId,
      userMessage: body.message.trim(),
    });
    if (titled) autoTitle = titled.title;
  } catch {
    // Title failures must not block the chat turn.
  }

  return c.json(
    ok({
      ...turn.response,
      ...(autoTitle ? { title: autoTitle } : {}),
    }),
  );
});

chatRoutes.post('/api/chat/resume', async (c) => {
  const userId = c.get('userId');
  const parsed = await parseJsonBody(c, chatResumeBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const body = parsed.data;

  const session = await getSessionForUser(c.env.DB, userId, body.sessionId);
  if (!session) return c.json(fail('Session not found', ErrorCodes.NOT_FOUND), 404);

  const turn = await resumeAgentTurn(c.env, {
    userId,
    sessionId: body.sessionId,
    decision: body.decision,
    note: body.note,
    interruptId: body.interruptId,
    language: body.language,
  });

  if (turn.kind === 'error') {
    const status =
      turn.status ??
      (turn.code === ErrorCodes.NO_PENDING_ACTION ||
      turn.message.includes('No pending')
        ? 404
        : 500);
    return c.json(
      fail(turn.message, turn.code ?? ErrorCodes.ERROR),
      status as ContentfulStatusCode,
    );
  }
  if (turn.kind !== 'complete') {
    return c.json(fail('Unexpected resume state', ErrorCodes.INTERNAL), 500);
  }

  let autoTitle: string | undefined;
  try {
    const titled = await maybeAutoTitleSession({
      env: c.env,
      db: c.env.DB,
      userId,
      sessionId: body.sessionId,
      userMessage:
        body.decision === 'approve'
          ? 'Approved kitchen updates'
          : 'Rejected kitchen updates',
    });
    if (titled) autoTitle = titled.title;
  } catch {
    // Title failures must not block resume.
  }

  return c.json(
    ok({
      ...turn.response,
      ...(autoTitle ? { title: autoTitle } : {}),
    }),
  );
});
