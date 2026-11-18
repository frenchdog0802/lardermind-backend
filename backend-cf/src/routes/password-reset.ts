import { Hono, type Context } from 'hono';
import { ok, fail } from '../lib/api-response';
import { ErrorCodes } from '../lib/error-codes';
import { parseJsonBody } from '../lib/validate';
import {
  passwordResetConfirmBodySchema,
  passwordResetRequestBodySchema,
} from '../schemas/auth';
import {
  AUTH_LIMITS,
  AuthRateLimitError,
  assertAuthAllowed,
  resetConfirmIpSubject,
  resetRequestEmailSubject,
  resetRequestIpSubject,
} from '../db/auth-rate-limit';
import { findUserByEmail, type UserRow } from '../db/users';
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  PASSWORD_RESET_TTL_SECONDS,
  setUserPasswordHash,
} from '../db/password-reset';
import { hashPassword } from '../lib/password';
import { sendMail } from '../lib/mailer';
import { clientIp } from '../middleware/auth';
import type { AuthVariables } from '../middleware/auth';
import type { Env } from '../env';

type Ctx = Context<{ Bindings: Env; Variables: AuthVariables }>;

export const passwordResetRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

/** Identical body for every request outcome (no account enumeration). */
export const PASSWORD_RESET_REQUEST_MESSAGE =
  'If an account exists for that email, we sent a link to reset your password.';

export const PASSWORD_RESET_INVALID_MESSAGE =
  'This reset link is invalid or has expired. Please request a new one.';

function resetLink(env: Env, token: string): string | null {
  const base = (env.FRONTEND_URL ?? '').trim().replace(/\/$/, '');
  if (!base) return null;
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

export function buildPasswordResetEmail(
  link: string,
  options: { hasGoogleSignIn: boolean },
): { subject: string; text: string; html: string } {
  const minutes = Math.round(PASSWORD_RESET_TTL_SECONDS / 60);
  const googleNote = options.hasGoogleSignIn
    ? 'Your account is also connected to Google, so you can keep using "Sign in with Google" instead.'
    : '';
  const text = [
    'Someone (hopefully you) asked to reset your LarderMind password.',
    '',
    `Reset your password: ${link}`,
    '',
    `This link works once and expires in ${minutes} minutes.`,
    googleNote,
    "If you didn't ask for this, you can ignore this email — your password won't change.",
  ]
    .filter((line, i, all) => line !== '' || all[i - 1] !== '')
    .join('\n');
  const escapedLink = link.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const html = `<p>Someone (hopefully you) asked to reset your LarderMind password.</p>
<p><a href="${escapedLink}">Reset your password</a></p>
<p>This link works once and expires in ${minutes} minutes.</p>
${googleNote ? `<p>${googleNote}</p>` : ''}
<p>If you didn't ask for this, you can ignore this email — your password won't change.</p>`;
  return { subject: 'Reset your LarderMind password', text, html };
}

function canResetPassword(user: UserRow | null): user is UserRow {
  if (!user) return false;
  if (Number(user.is_guest) === 1 || user.role === 'guest') return false;
  return Boolean(user.email?.trim());
}

/** Run work after the response when possible so response time does not reveal account existence. */
async function runInBackground(c: Ctx, work: Promise<unknown>): Promise<void> {
  let ctx: Pick<ExecutionContext, 'waitUntil'> | undefined;
  try {
    ctx = c.executionCtx;
  } catch {
    ctx = undefined;
  }
  if (ctx) {
    ctx.waitUntil(work);
    return;
  }
  await work;
}

async function rateLimited(c: Ctx, subject: string, limit: number): Promise<number | null> {
  try {
    await assertAuthAllowed(c.env.DB, subject, limit);
    return null;
  } catch (error) {
    if (error instanceof AuthRateLimitError) return error.retryAfterSeconds;
    throw error;
  }
}

async function issueAndSendReset(env: Env, user: UserRow): Promise<void> {
  try {
    const { token } = await createPasswordResetToken(env.DB, user.id);
    const link = resetLink(env, token);
    if (!link) {
      console.error(JSON.stringify({ level: 'error', msg: 'password_reset_no_frontend_url' }));
      return;
    }
    const mail = buildPasswordResetEmail(link, { hasGoogleSignIn: Boolean(user.google_id) });
    await sendMail(env, { to: user.email, ...mail });
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'password_reset_issue_failed',
        error: error instanceof Error ? error.message : 'unknown',
      }),
    );
  }
}

passwordResetRoutes.post('/api/auth/password-reset/request', async (c) => {
  const parsed = await parseJsonBody(c, passwordResetRequestBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);

  const retryIp = await rateLimited(
    c,
    resetRequestIpSubject(clientIp(c)),
    AUTH_LIMITS.resetRequestIp,
  );
  if (retryIp !== null) {
    c.header('Retry-After', String(retryIp));
    return c.json(fail('Too many attempts. Try again later.', ErrorCodes.RATE_LIMITED), 429);
  }

  const email = parsed.data.email;
  // Per-email cap is silent: same generic 200 so it reveals nothing about the account.
  const retryEmail = await rateLimited(
    c,
    resetRequestEmailSubject(email),
    AUTH_LIMITS.resetRequestEmail,
  );

  if (retryEmail === null) {
    const user = await findUserByEmail(c.env.DB, email);
    if (canResetPassword(user)) {
      await runInBackground(c, issueAndSendReset(c.env, user));
    }
  }

  return c.json(ok({ message: PASSWORD_RESET_REQUEST_MESSAGE }));
});

passwordResetRoutes.post('/api/auth/password-reset/confirm', async (c) => {
  const parsed = await parseJsonBody(c, passwordResetConfirmBodySchema);
  if (!parsed.ok) return c.json(fail(parsed.message, parsed.code), 400);

  const retry = await rateLimited(
    c,
    resetConfirmIpSubject(clientIp(c)),
    AUTH_LIMITS.resetConfirmIp,
  );
  if (retry !== null) {
    c.header('Retry-After', String(retry));
    return c.json(fail('Too many attempts. Try again later.', ErrorCodes.RATE_LIMITED), 429);
  }

  // Hash first (CPU-heavy) so a burned token always gets its password written.
  const hashed = await hashPassword(parsed.data.password);
  const userId = await consumePasswordResetToken(c.env.DB, parsed.data.token);
  if (!userId) {
    return c.json(fail(PASSWORD_RESET_INVALID_MESSAGE, ErrorCodes.RESET_TOKEN_INVALID), 400);
  }
  await setUserPasswordHash(c.env.DB, userId, hashed);
  return c.json(ok({ reset: true }));
});
