import type { Context, Next } from 'hono';
import { verifyJwt } from '../lib/jwt';
import type { Env } from '../env';

export type AuthVariables = {
  userId: string;
};

export async function requireAuth(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  next: Next,
) {
  const header = c.req.header('Authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) {
    return c.json({ success: false, message: 'Unauthorized' }, 401);
  }
  if (!c.env.JWT_SECRET || c.env.JWT_SECRET.length < 32) {
    return c.json({ success: false, message: 'Server misconfigured' }, 500);
  }
  try {
    const { userId } = await verifyJwt(token, c.env.JWT_SECRET);
    c.set('userId', userId);
    await next();
  } catch {
    return c.json({ success: false, message: 'Invalid token' }, 401);
  }
}
