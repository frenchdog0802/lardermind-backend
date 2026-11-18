# Launch bugs — 2026-11 (backend-cf)

Combined bug record for the production E2E pass (branch `fix/launch-bugs`). Frontend items: see
`lardermind-frontend/docs/bugs/launch-bugs-2026-11.md`.

## a. "1 liter milk" → "0 l"
- Backend stores `{quantity: 1, unit: "l"}` verbatim (`mergeAddPantryItem`). Root cause was frontend display
  (`formatQuantity` assumed ml). No backend change.

## c. Stripe Checkout says "200 AI messages/day"; app says 150
- **Enforced limit:** `PRO_TIER.aiMessagesPerDay = 150` (`src/lib/entitlement.ts`) →
  `PRO_AI_MESSAGES_PER_DAY` (`src/db/quotas.ts`) → `checkAndIncrementAiMessage`; also returned by
  `/api/subscription/plans` and `/status`. Unchanged.
- **Where 200 came from:** not in code or config. Checkout does not send a product description; the text Stripe
  shows is the **Product description in the Stripe dashboard**. Stale "200" also lived in `backend-cf/README.md`,
  `docs/features/web-stripe-subscription.md`, `tasks/web-stripe-subscription/checklist.md` and a test name.
- **Fix:** docs + test name corrected to 150 (test now asserts 150). **Owner action:** edit the Stripe product
  description (dashboard) to 150. Stripe was not called.

## d. Approve counted as an AI message
- **Current / expected:** 1 message + 1 Approve reported as 2 used. Approvals must not count.
- **Investigation:** the only quota increment is `checkAndIncrementAiMessage` in `runAgentTurn`
  (`/api/chat/send`, `/api/chat/stream`). `/api/chat/resume` → `resumeAgentTurn` never touches `usage_quotas`, and
  the SPA's Approve only calls `/resume`. The double count could **not be reproduced from this branch's code**;
  most likely the deployed Worker predates `3d9cb0a` (HITL resume hardening), or the run double-sent the message.
- **Fix:** removed the unused `incrementAiUsage()` helper (an unconditional `+1` trap) and added a regression test.
- **Regression test:** `src/agent/hitl-resume.test.ts` — approve and reject never read/write `usage_quotas`.
- **Owner action:** after deploy, re-run the E2E check; if it still shows 2, compare the deployed Worker version.

## e. Password reset
- **Endpoints:** `POST /api/auth/password-reset/request {email}` → always `200` with the same generic message
  (unknown email, guest, per-email cap). Per-IP cap → `429`. Token issue + email run in `waitUntil` so timing does
  not reveal account existence. `POST /api/auth/password-reset/confirm {token, password}` → `200` or `400`
  `reset_token_invalid`.
- **Token:** 256-bit random, only SHA-256 stored (`password_reset_tokens`, migration `0012`), 1 h expiry, single-use
  via atomic `UPDATE … WHERE used_at IS NULL AND expires_at > now RETURNING`. A new request burns older tokens;
  a successful reset burns all outstanding tokens. Password rule = signup (8–256), stored as PBKDF2 like signup.
- **Rate limits** (existing `auth_rate_limits`, 15 min window): request 10/IP, 3/email (silent), confirm 20/IP.
- **Mail:** new `src/lib/mailer.ts` (Resend HTTP API). Needs secret `RESEND_API_KEY` + var `MAIL_FROM`;
  when either is missing it logs `mail_not_configured` (no address, no link) and no-ops.
- **Google accounts:** they get the same link (setting a password adds email login); the email notes they can keep
  using Google sign-in. Guests never get a token.
- **Regression tests:** `src/routes/password-reset.test.ts`.

## g. Checkout success_url
- Already `FRONTEND_URL/?subscription=success` (cancel: `?subscription=cancelled`). Extracted to
  `checkoutReturnUrls()` with a unit test (`src/lib/stripe.test.ts`). SPA now re-polls status after success.
