/** Stable machine codes on `{ success: false, code }` responses. */
export const ErrorCodes = {
  ERROR: 'error',
  VALIDATION_ERROR: 'validation_error',
  UNAUTHORIZED: 'unauthorized',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  VERSION_CONFLICT: 'version_conflict',
  RATE_LIMITED: 'rate_limited',
  IDEMPOTENCY_IN_PROGRESS: 'idempotency_in_progress',
  IDEMPOTENCY_KEY_REUSED: 'idempotency_key_reused',
  INTERRUPT_MISMATCH: 'interrupt_mismatch',
  RESUME_IN_PROGRESS: 'resume_in_progress',
  NO_PENDING_ACTION: 'no_pending_action',
  TOOL_ARGS_INVALID: 'tool_args_invalid',
  TARGET_MISSING: 'target_missing',
  INTERNAL: 'internal_error',
  GUEST_EXPIRED: 'guest_expired',
  SIGNUP_REQUIRED: 'signup_required',
  GUEST_CHAT_RATE_LIMITED: 'guest_chat_rate_limited',
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
