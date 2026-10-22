# Design: Harden the Cloudflare API

**Feature:** `docs/features/backend-cf-hardening.md`  
**Status:** Done

HITL single-execution is specified in `docs/fixes/hitl-double-execution-fix.md` and shares migration `0011_backend_hardening.sql`.

---

## Architecture

```
Client (web / mobile)
    │  Bearer JWT (unchanged) · optional Idempotency-Key · optional version
    ▼
Hono Worker
    ├─ CORS (allow Idempotency-Key, X-Expected-Version, X-Request-Id)
    ├─ request log middleware (JSON line + X-Request-Id)
    ├─ zod parse → error catalog envelope
    └─ D1
         users.hashed_password     versioned PBKDF2 or legacy HMAC
         auth_rate_limits          fixed window counters
         idempotency_records       user + key → stored HTTP result
         shopping_list_items.version
         chat_sessions.pending_claim_token / hitl_checkpoint_json
```

Workers AI is not on the chat path. Chat and vision go through Cloudflare AI Gateway (DeepSeek and OpenAI). D1 is the system of record. R2 stores media. JWT HS256 is the session credential.

## Password format

| Kind | `hashed_password` | `salt` column |
|------|-------------------|---------------|
| Legacy | 40-char HMAC-SHA1 hex (key = salt, message = password) | required |
| Current | `pbkdf2-sha256$<iterations>$<saltHex>$<hashHex>` | ignored |

- KDF: `crypto.subtle.deriveBits` PBKDF2, SHA-256, 16-byte salt, 256-bit output, **100,000** iterations.
- Compare: XOR of UTF-8 bytes across `max(len)` with the length mixed into the accumulator. No early return.
- `verifyPassword` returns `{ ok, needsRehash }`. Rehash when the legacy format matches, or when PBKDF2 iterations are below the current default.
- `signInUser` writes the new string after a match. A failed UPDATE is logged and login still succeeds.

### Refresh tokens (not in this change)

Clients send one long-lived Bearer token (default 30 days) and have no refresh call. Shipping 15-minute access tokens now would log every current web and mobile session out.

Follow-up, when a client PR is ready:

1. `POST /api/auth/token` accepts a refresh token and returns `{ access_token, refresh_token, expires_in }`.
2. Access JWT TTL ~15 minutes, same `user_id` claim so `requireAuth` stays valid.
3. Table `refresh_tokens (id, user_id, token_hash, expires_at, revoked_at, replaced_by)`.
4. Rotate on use. `GET /api/auth/signout` revokes the presented refresh token (body or cookie). Compromise response is revoke-by-user.
5. Keep accepting the current long-lived JWT until clients send `Authorization` access tokens only.

Until that ships, `JWT_EXPIRES_IN_SECONDS` remains the only TTL.

## Rate limits

Table `auth_rate_limits (subject_hash, bucket_start)` unique, `attempts` incremented with `ON CONFLICT`.

| Route | Subject | Limit / 15 min |
|-------|---------|----------------|
| signin | IP and normalized email | 30 IP, 20 email |
| signup | IP | 10 |
| google-login | IP | 30 |
| google-callback | IP | 30, then 302 to the SPA error hash (browser navigation, not JSON) |

Subject material is SHA-256. Window is fixed (`floor(now / 900) * 900`). Response `429` + `Retry-After` + `code: rate_limited`.

## Request validation

Zod schemas live in `src/schemas/`. `parseJsonBody` returns a 400-shaped message. Shopping create/patch still accepts the flat body and the nested `details` object.

`src/openapi/spec.ts` converts those Zod objects to OpenAPI 3.0 schema objects and serves them at `GET /api/openapi.json` (no auth). Covered operations: auth signup/signin/google-login, chat resume, shopping-list list/create/update/delete.

## Error catalog

`src/lib/error-codes.ts`

| Code | When |
|------|------|
| `error` | Uncategorized failure |
| `validation_error` | JSON / zod / bad idempotency key |
| `unauthorized` | Missing or bad token |
| `forbidden` | Guest on a closed route, and existing guest denials |
| `not_found` | Missing row or session |
| `conflict` | Generic conflict (chat busy) |
| `version_conflict` | Shopping version mismatch |
| `rate_limited` | Auth window exceeded |
| `idempotency_in_progress` | Same key, first request not finished |
| `idempotency_key_reused` | Same key, different method or path |
| `interrupt_mismatch` | Resume `interruptId` does not match |
| `resume_in_progress` | HITL claim held by another request |
| `no_pending_action` | Resume with nothing pending and nothing to replay |
| `tool_args_invalid` | Pending tool args fail the tool schema |
| `target_missing` | Approval-time row check failed |
| `internal_error` | Unhandled exception |
| `guest_expired` / `signup_required` / `guest_chat_rate_limited` | Existing guest codes |

Envelope: `{ success, message, code, requestId?, data? }`. `requestId` is added for `success: false`.

## Shopping contract

Migration adds `shopping_list_items.version INTEGER NOT NULL DEFAULT 1`.

DTO adds top-level `version` (also copied under `details.version`). Updates set `version = COALESCE(version, 1) + 1`.

Expected version:

- PUT: body `version` or `details.version`, else header `X-Expected-Version`
- DELETE: query `version`, else header `X-Expected-Version`
- Disagreeing sources → 400
- Omitted → unconditional write (version still increments on update)

409 body:

```json
{
  "success": false,
  "message": "Version conflict",
  "code": "version_conflict",
  "data": { "current": { "id": "…", "version": 3 } }
}
```

`Idempotency-Key`: 1–128 chars `[A-Za-z0-9._:-]`. Stored per `(user_id, idempotency_key)` with method, route key (`POST /api/shopping-list`, `PUT /api/shopping-list/{id}`, `DELETE /api/shopping-list/{id}`), status, and response JSON. Replay sends `Idempotency-Replayed: true`. Records older than 24h are deleted for that user on the next keyed request.

No batch endpoint in this change.

## CI

`.github/workflows/backend-cf.yml`

1. `check` — `npm ci`, `npm run typecheck` (`tsc --noEmit`; `src/**/*.test.ts` is excluded because those files import Node builtins and the Workers lib does not include them), `npm test` on push, pull_request, and workflow_dispatch.
2. `migrate` — needs `check`, skipped on pull_request.
3. `deploy` — needs `migrate`.

No lint script exists, so CI does not invent an ESLint run.

## Logging

`console.log` of one JSON object: `level`, `msg: "request"`, `requestId`, `method`, `path`, `status`, `durationMs`. Errors use `level: "error"` and `msg: "unhandled"` plus `error` (message only).

## Rollback

- Redeploy the previous Worker **before** users log in (rehash) if you must roll back password code. Users already rewritten to PBKDF2 cannot sign in on the old HMAC-only Worker.
- New tables and columns are unused by the old Worker; leaving them in place is safe.
- CI: revert the workflow file to restore deploy-without-tests (not recommended).
