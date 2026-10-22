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
  getPendingInterrupt,
  getSessionForUser,
  listHistory,
  listSessions,
  pendingInterruptForHistory,
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

chatRoutes.get('/api/chat/sessions', async (c) => {
  const userId = c.get('userId');
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
  const session = await getSessionForUser(c.env.DB, userId, sessionId);
  if (!session) return c.json(fail('Session not found'), 404);
  const messages = await listHistory(c.env.DB, userId, sessionId);
  const pending = await getPendingInterrupt(c.env.DB, userId, sessionId);
  const pendingInterrupt = pendingInterruptForHistory(pending);
  return c.json(
    ok({
      sessionId,
      messages,
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

  if (turn.kind === 'interrupt') {
    return c.json(
      ok({
        type: 'interrupt',
        message: turn.message,
        data: turn.data,
        ...(autoTitle ? { title: autoTitle } : {}),
      }),
    );
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
  return c.json(ok(turn.response));
});
