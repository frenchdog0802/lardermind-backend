import { Hono } from 'hono';
import { ok, fail } from '../lib/api-response';
import { signJwt } from '../lib/jwt';
import { encodeBase64UrlJson } from '../lib/base64url';
import { verifyGoogleIdToken } from '../lib/google-id-token';
import {
  createUser,
  signInUser,
  toAuthUserDto,
  upsertGoogleUser,
} from '../db/users';
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

type GoogleLoginBody = {
  token?: string;
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

function frontendOrigin(env: Env): string {
  const raw = (env.FRONTEND_URL ?? '').trim().replace(/\/$/, '');
  if (!raw) {
    throw new Error('FRONTEND_URL not configured');
  }
  return raw;
}

async function loginWithGoogleIdToken(env: Env, idToken: string) {
  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim();
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }
  const profile = await verifyGoogleIdToken(idToken, clientId);
  const user = await upsertGoogleUser(env, profile);
  const token = await issueToken(env, user.id);
  return { token, user: toAuthUserDto(user) };
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

authRoutes.post('/api/auth/google-login', async (c) => {
  const body = await c.req.json<GoogleLoginBody>();
  if (!body.token) {
    return c.json(fail('Missing Google ID token'), 400);
  }
  try {
    const data = await loginWithGoogleIdToken(c.env, body.token);
    return c.json(ok(data));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google login failed';
    const status =
      message.includes('not configured') || message.includes('JWT_SECRET')
        ? 500
        : 400;
    return c.json(fail(message), status);
  }
});

authRoutes.post('/api/auth/google-callback', async (c) => {
  let frontend: string;
  try {
    frontend = frontendOrigin(c.env);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'FRONTEND_URL not configured';
    return c.json(fail(message), 500);
  }

  try {
    const form = await c.req.parseBody();
    const credential = form.credential;
    if (typeof credential !== 'string' || !credential) {
      throw new Error('Missing Google credential');
    }
    const data = await loginWithGoogleIdToken(c.env, credential);
    const payload = encodeBase64UrlJson(data);
    return c.redirect(`${frontend}/#google_auth=${payload}`, 302);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google login failed';
    return c.redirect(
      `${frontend}/#google_auth_error=${encodeURIComponent(message)}`,
      302,
    );
  }
});
