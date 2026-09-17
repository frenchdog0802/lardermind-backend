import { Hono } from 'hono';
import { ok, fail } from '../lib/api-response';
import { signJwt } from '../lib/jwt';
import { createUser, signInUser, toAuthUserDto } from '../db/users';
import type { Env } from '../env';

type SignupBody = {
  first_name?: string;
  last_name?: string;
  email?: string;
  password?: string;
};

type SigninBody = {
  email?: string;
  password?: string;
};

export const authRoutes = new Hono<{ Bindings: Env }>();

function jwtExpires(env: Env): number {
  const parsed = Number.parseInt(env.JWT_EXPIRES_IN_SECONDS ?? '2592000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2592000;
}

async function issueToken(env: Env, userId: string): Promise<string> {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET not configured');
  }
  return signJwt(userId, env.JWT_SECRET, jwtExpires(env));
}

authRoutes.post('/api/auth/signup', async (c) => {
  const body = await c.req.json<SignupBody>();
  if (!body.first_name || !body.last_name || !body.email || !body.password) {
    return c.json(fail('Missing required fields'), 400);
  }
  try {
    const user = await createUser(c.env, {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      password: body.password,
    });
    const token = await issueToken(c.env, user.id);
    return c.json(ok({ token, user: toAuthUserDto(user) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signup failed';
    return c.json(fail(message), 400);
  }
});

authRoutes.post('/api/auth/signin', async (c) => {
  const body = await c.req.json<SigninBody>();
  if (!body.email || !body.password) {
    return c.json(fail('Missing email or password'), 400);
  }
  try {
    const user = await signInUser(c.env, {
      email: body.email,
      password: body.password,
    });
    const token = await issueToken(c.env, user.id);
    return c.json(ok({ token, user: toAuthUserDto(user) }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signin failed';
    return c.json(fail(message), 400);
  }
});

authRoutes.get('/api/auth/signout', (c) =>
  c.json(ok({ message: 'Signed out successfully' })),
);

authRoutes.post('/api/auth/google-login', (c) =>
  c.json(fail('Google login not implemented on CF API yet'), 501),
);
