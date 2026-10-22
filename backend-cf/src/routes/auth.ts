import { Hono, type Context } from 'hono';
import { ok, fail } from '../lib/api-response';
import { ErrorCodes } from '../lib/error-codes';
import { parseJsonBody } from '../lib/validate';
import {
  signupBodySchema,
  signinBodySchema,
  googleLoginBodySchema,
  claimGuestBodySchema,
} from '../schemas/auth';
import {
  AUTH_LIMITS,
  AuthRateLimitError,
  assertAuthAllowed,
  googleIpSubject,
  signinEmailSubject,
  signinIpSubject,
  signupIpSubject,
} from '../db/auth-rate-limit';
import { signJwt, verifyJwt } from '../lib/jwt';
import { encodeBase64UrlJson } from '../lib/base64url';
import { verifyGoogleIdToken } from '../lib/google-id-token';
import {
  createUser,
  findUserById,
  signInUser,
  toAuthUserDto,
  upsertGoogleUser,
} from '../db/users';
import {
  assertGuestMintAllowed,
  claimGuestKitchen,
  createGuestUser,
  isGuestExpired,
  isGuestUserRow,
  purgeExpiredGuests,
} from '../db/guests';
import { GUEST_TTL_SECONDS } from '../lib/entitlement';
import { clientIp, requireAuth } from '../middleware/auth';
import type { AuthVariables } from '../middleware/auth';
import type { Env } from '../env';

export const authRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

async function enforceAuthLimit(
  c: Context<{ Bindings: Env; Variables: AuthVariables }>,
  subject: string,
  limit: number,
): Promise<Response | null> {
  try {
    await assertAuthAllowed(c.env.DB, subject, limit);
    return null;
  } catch (error) {
    if (error instanceof AuthRateLimitError) {
      c.header('Retry-After', String(error.retryAfterSeconds));
      return c.json(fail(error.message, ErrorCodes.RATE_LIMITED), 429);
    }
    throw error;
  }
}

function jwtExpires(env: Env): number {
  const parsed = Number.parseInt(env.JWT_EXPIRES_IN_SECONDS ?? '2592000', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 2592000;
}

async function issueToken(
  env: Env,
  userId: string,
  options: { guest?: boolean; expiresInSeconds?: number } = {},
): Promise<string> {
  if (!env.JWT_SECRET || env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET not configured');
  }
  const expiresIn = options.expiresInSeconds ?? jwtExpires(env);
  return signJwt(userId, env.JWT_SECRET, expiresIn, { guest: options.guest });
}

async function maybeClaimGuest(
  env: Env,
  realUserId: string,
  guestToken?: string | null,
): Promise<boolean> {
  if (!guestToken?.trim()) return false;
  const { userId: guestId, isGuest } = await verifyJwt(
    guestToken.trim(),
    env.JWT_SECRET,
  );
  if (!isGuest) throw new Error('Not a guest token');
  const guest = await findUserById(env.DB, guestId);
  if (!guest || !isGuestUserRow(guest)) throw new Error('Guest not found');
  if (isGuestExpired(guest)) throw new Error('Guest session expired');
  await claimGuestKitchen(env.DB, guestId, realUserId);
  return true;
}

function frontendOrigin(env: Env): string {
  const raw = (env.FRONTEND_URL ?? '').trim().replace(/\/$/, '');
  if (!raw) {
    throw new Error('FRONTEND_URL not configured');
  }
  return raw;
}

async function loginWithGoogleIdToken(
  env: Env,
  idToken: string,
  guestToken?: string | null,
) {
  const clientId = (env.GOOGLE_CLIENT_ID ?? '').trim();
  if (!clientId) {
    throw new Error('GOOGLE_CLIENT_ID not configured');
  }
  const profile = await verifyGoogleIdToken(idToken, clientId);
  const user = await upsertGoogleUser(env, profile);
  let claimed = false;
  try {
    claimed = await maybeClaimGuest(env, user.id, guestToken);
  } catch {
    claimed = false;
  }
  const token = await issueToken(env, user.id);
  return { token, user: toAuthUserDto(user), claimed };
}

authRoutes.post('/api/auth/guest', async (c) => {
  try {
    await purgeExpiredGuests(c.env.DB).catch(() => undefined);
    await assertGuestMintAllowed(c.env.DB, clientIp(c));
    const user = await createGuestUser(c.env.DB);
    const token = await issueToken(c.env, user.id, {
      guest: true,
      expiresInSeconds: GUEST_TTL_SECONDS,
    });
    return c.json(
      ok({
        token,
        user: {
          ...toAuthUserDto(user),
          is_guest: true,
          expires_at: user.expires_at ?? null,
        },
        expires_in: GUEST_TTL_SECONDS,
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Guest mint failed';
    const status = message.includes('rate limit') ? 429 : 400;
    return c.json(fail(message), status);
  }
});

authRoutes.post('/api/auth/signup', async (c) => {
  const parsed = await parseJsonBody(c, signupBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const limited = await enforceAuthLimit(
    c,
    signupIpSubject(clientIp(c)),
    AUTH_LIMITS.signupIp,
  );
  if (limited) return limited;
  const body = parsed.data;
  try {
    const user = await createUser(c.env, {
      first_name: body.first_name,
      last_name: body.last_name,
      email: body.email,
      password: body.password,
    });
    let claimed = false;
    try {
      claimed = await maybeClaimGuest(c.env, user.id, body.guest_token);
    } catch {
      claimed = false;
    }
    const token = await issueToken(c.env, user.id);
    return c.json(ok({ token, user: toAuthUserDto(user), claimed }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signup failed';
    return c.json(fail(message), 400);
  }
});

authRoutes.post('/api/auth/signin', async (c) => {
  const parsed = await parseJsonBody(c, signinBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const body = parsed.data;
  const limitedIp = await enforceAuthLimit(
    c,
    signinIpSubject(clientIp(c)),
    AUTH_LIMITS.signinIp,
  );
  if (limitedIp) return limitedIp;
  const limitedEmail = await enforceAuthLimit(
    c,
    signinEmailSubject(body.email),
    AUTH_LIMITS.signinEmail,
  );
  if (limitedEmail) return limitedEmail;
  try {
    const user = await signInUser(c.env, {
      email: body.email,
      password: body.password,
    });
    let claimed = false;
    try {
      claimed = await maybeClaimGuest(c.env, user.id, body.guest_token);
    } catch {
      claimed = false;
    }
    const token = await issueToken(c.env, user.id);
    return c.json(ok({ token, user: toAuthUserDto(user), claimed }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Signin failed';
    return c.json(fail(message), 400);
  }
});

authRoutes.get('/api/auth/signout', (c) =>
  c.json(ok({ message: 'Signed out successfully' })),
);

authRoutes.post('/api/auth/google-login', async (c) => {
  const parsed = await parseJsonBody(c, googleLoginBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  const limited = await enforceAuthLimit(
    c,
    googleIpSubject(clientIp(c)),
    AUTH_LIMITS.googleIp,
  );
  if (limited) return limited;
  const body = parsed.data;
  try {
    const data = await loginWithGoogleIdToken(
      c.env,
      body.token,
      body.guest_token,
    );
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

authRoutes.post('/api/auth/claim-guest', requireAuth, async (c) => {
  if (c.get('isGuest')) {
    return c.json(fail('Sign in with a real account to claim a guest kitchen'), 403);
  }
  const parsed = await parseJsonBody(c, claimGuestBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);
  try {
    await maybeClaimGuest(c.env, c.get('userId'), parsed.data.guest_token);
    return c.json(ok({ claimed: true }));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claim failed';
    return c.json(fail(message), 400);
  }
});

authRoutes.post('/api/auth/purge-expired-guests', async (c) => {
  // Local/dev cleanup helper; production can call via cron or after mint.
  const purged = await purgeExpiredGuests(c.env.DB);
  return c.json(ok({ purged }));
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
    await assertAuthAllowed(
      c.env.DB,
      googleIpSubject(clientIp(c)),
      AUTH_LIMITS.googleIp,
    );
  } catch (error) {
    if (error instanceof AuthRateLimitError) {
      return c.redirect(
        `${frontend}/#google_auth_error=${encodeURIComponent(error.message)}`,
        302,
      );
    }
    throw error;
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
