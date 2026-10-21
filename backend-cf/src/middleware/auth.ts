import type { Context, Next } from 'hono';
import { verifyJwt } from '../lib/jwt';
import type { Env } from '../env';
import {
  findUserById,
  type UserRow,
} from '../db/users';
import {
  isGuestExpired,
  isGuestUserRow,
  purgeExpiredGuests,
} from '../db/guests';

export type AuthVariables = {
  userId: string;
  isGuest: boolean;
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
    const { userId, isGuest } = await verifyJwt(token, c.env.JWT_SECRET);
    const user = await findUserById(c.env.DB, userId);
    if (!user) {
      return c.json({ success: false, message: 'Invalid token' }, 401);
    }
    if (isGuest || isGuestUserRow(user)) {
      if (isGuestExpired(user)) {
        await purgeExpiredGuests(c.env.DB).catch(() => undefined);
        return c.json(
          { success: false, message: 'Guest session expired', code: 'guest_expired' },
          401,
        );
      }
      c.set('userId', userId);
      c.set('isGuest', true);
    } else {
      c.set('userId', userId);
      c.set('isGuest', false);
    }
    await next();
  } catch {
    return c.json({ success: false, message: 'Invalid token' }, 401);
  }
}

/** Block guests from closed-loop / durable surfaces. */
export async function requireNonGuest(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  next: Next,
) {
  if (c.get('isGuest')) {
    return c.json(
      {
        success: false,
        message: 'Sign up to save your kitchen and use this feature',
        code: 'signup_required',
      },
      403,
    );
  }
  await next();
}

export function clientIp(c: Context): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

export type { UserRow };
