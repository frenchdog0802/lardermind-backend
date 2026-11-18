import type { Env } from '../env';

/**
 * Minimal transactional mail sender.
 *
 * Provider: Resend HTTP API (https://resend.com/docs/api-reference/emails/send-email).
 * Config: secret `RESEND_API_KEY` + var `MAIL_FROM` (e.g. `LarderMind <no-reply@lardermind.com>`,
 * the domain must be verified in Resend). When either is missing the sender logs and
 * no-ops so callers never fail because mail is not configured.
 */
export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export type MailResult = { sent: true } | { sent: false; reason: 'not_configured' | 'provider_error' };

type FetchFn = typeof fetch;

export const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export function mailConfigured(env: Pick<Env, 'RESEND_API_KEY' | 'MAIL_FROM'>): boolean {
  return Boolean(env.RESEND_API_KEY?.trim() && env.MAIL_FROM?.trim());
}

/** Never log full addresses or message bodies (bodies may contain secrets such as reset links). */
function recipientDomain(to: string): string {
  const at = to.lastIndexOf('@');
  return at >= 0 ? to.slice(at + 1) : 'unknown';
}

export async function sendMail(
  env: Pick<Env, 'RESEND_API_KEY' | 'MAIL_FROM'>,
  message: MailMessage,
  fetchImpl: FetchFn = fetch,
): Promise<MailResult> {
  if (!mailConfigured(env)) {
    console.warn(
      JSON.stringify({
        level: 'warn',
        msg: 'mail_not_configured',
        subject: message.subject,
        toDomain: recipientDomain(message.to),
      }),
    );
    return { sent: false, reason: 'not_configured' };
  }

  try {
    const res = await fetchImpl(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY!.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.MAIL_FROM!.trim(),
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
      }),
    });
    if (!res.ok) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'mail_send_failed',
          status: res.status,
          subject: message.subject,
          toDomain: recipientDomain(message.to),
        }),
      );
      return { sent: false, reason: 'provider_error' };
    }
    return { sent: true };
  } catch (error) {
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'mail_send_failed',
        error: error instanceof Error ? error.message : 'fetch failed',
        subject: message.subject,
        toDomain: recipientDomain(message.to),
      }),
    );
    return { sent: false, reason: 'provider_error' };
  }
}
