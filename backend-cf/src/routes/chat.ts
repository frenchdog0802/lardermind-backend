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

type ChatSendBody = {
  message?: string;
  sessionId?: string;
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
  const body = await c.req.json<{ title?: string }>().catch(() => ({}));
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
      actions: [],
      description: 'Tool actions not available on CF API v1',
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
    sessionId: sessionId!,
    message: body.message.trim(),
  });
});

chatRoutes.post('/api/chat/send', (c) =>
  c.json(fail('Use POST /api/chat/stream on CF API'), 501),
);

chatRoutes.post('/api/chat/resume', (c) =>
  c.json(fail('HITL resume not implemented on CF API v1'), 501),
);
