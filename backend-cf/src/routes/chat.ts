import { Hono } from 'hono';
import { ok, fail } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  clearHistory,
  createSession,
  deleteSession,
  getSessionForUser,
  listHistory,
  listSessions,
  updateSessionTitle,
} from '../db/chat';
import { streamCookingChat } from '../agent/stream-chat';
import { resumeAgentTurn, runAgentTurn } from '../agent/agent-loop';
import { maybeAutoTitleSession } from '../agent/auto-title';
import { listToolNames } from '../agent/tools/definitions';

type ChatSendBody = {
  message?: string;
  sessionId?: string;
};

type ChatResumeBody = {
  sessionId?: string;
  decision?: 'approve' | 'reject';
  note?: string;
};

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
  return c.json(ok({ sessionId, messages }));
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

chatRoutes.post('/api/chat/stream', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<ChatSendBody>();
  if (!body.message?.trim()) {
    return c.json(fail('message is required'), 400);
  }

  let sessionId = body.sessionId;
  if (sessionId) {
    const session = await getSessionForUser(c.env.DB, userId, sessionId);
    if (!session) return c.json(fail('Session not found'), 404);
  } else {
    const created = await createSession(c.env.DB, userId);
    sessionId = created.id;
  }

  return streamCookingChat(c.env, {
    userId,
    sessionId,
    message: body.message.trim(),
  });
});

chatRoutes.post('/api/chat/send', async (c) => {
  const userId = c.get('userId');
  const body = await c.req.json<ChatSendBody>();
  if (!body.message?.trim()) {
    return c.json(fail('message is required'), 400);
  }

  let sessionId = body.sessionId;
  if (sessionId) {
    const session = await getSessionForUser(c.env.DB, userId, sessionId);
    if (!session) return c.json(fail('Session not found'), 404);
  } else {
    const created = await createSession(c.env.DB, userId);
    sessionId = created.id;
  }

  const turn = await runAgentTurn(c.env, {
    userId,
    sessionId,
    message: body.message.trim(),
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
  const body = (await c.req.json<ChatResumeBody>().catch(() => ({}))) as ChatResumeBody;
  if (!body.sessionId?.trim()) {
    return c.json(fail('sessionId is required'), 400);
  }
  if (body.decision !== 'approve' && body.decision !== 'reject') {
    return c.json(fail("decision must be 'approve' or 'reject'"), 400);
  }

  const session = await getSessionForUser(c.env.DB, userId, body.sessionId);
  if (!session) return c.json(fail('Session not found'), 404);

  const turn = await resumeAgentTurn(c.env, {
    userId,
    sessionId: body.sessionId,
    decision: body.decision,
    note: body.note,
  });

  if (turn.kind === 'error') {
    const status = turn.message.includes('No pending') ? 404 : 500;
    return c.json(fail(turn.message), status);
  }
  if (turn.kind !== 'complete') {
    return c.json(fail('Unexpected resume state'), 500);
  }
  return c.json(ok(turn.response));
});
