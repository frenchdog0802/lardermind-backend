import type { Context } from 'hono';
import type { ZodType } from 'zod';
import { ErrorCodes, type ErrorCode } from './error-codes';

export async function parseJsonBody<T>(
  c: Context,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; message: string; code: ErrorCode }> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    return {
      ok: false,
      message: 'Invalid JSON',
      code: ErrorCodes.VALIDATION_ERROR,
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const message = parsed.error.issues
      .slice(0, 5)
      .map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : 'body';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    return {
      ok: false,
      message: message || 'Invalid body',
      code: ErrorCodes.VALIDATION_ERROR,
    };
  }
  return { ok: true, data: parsed.data };
}
