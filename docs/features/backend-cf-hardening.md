# Feature: Harden the Cloudflare API (`backend-cf/`)

**Status:** Done  
**Scope:** Password hashing, auth rate limits, request validation + OpenAPI, structured logs and error codes, shopping-list idempotency and versions, CI gates before migrate/deploy  
**Out of scope:** Short-lived access + refresh tokens (planned, not shipped — see design); shopping-list batch endpoint; rewriting every existing route parser onto zod in one pass; ESLint (not configured)

Related bug (separate flow): HITL approval must run at most once — `docs/bugs/hitl-double-execution.md`.

---

## 1. Summary

The Workers API stores passwords as HMAC-SHA1, deploys without running tests, and has no shared request schema, error-code catalog, or safe retry story for the shopping list. Clients (web and mobile) keep working: new fields and headers are optional, and existing JWTs stay valid.

## 2. Requirements

### 2.1 Passwords

- New passwords use PBKDF2-SHA256 (WebCrypto) with a high iteration count.
- Stored format is versioned and self-contained.
- Compare does not return early on length mismatch.
- A successful login with a legacy HMAC-SHA1 hash rewrites it to PBKDF2.
- Wrong password and unknown email still fail with the existing messages.

### 2.2 Auth rate limits

- `POST /api/auth/signup`, `/signin`, `/google-login`, and `/google-callback` are limited per IP (signin also per email).
- Over the limit: HTTP 429, `code: rate_limited`, `Retry-After`.
- Existing guest mint limits stay as they are.

### 2.3 Tokens

- Keep the current HS256 JWT (`user_id`, optional `guest`, expiry from `JWT_EXPIRES_IN_SECONDS`).
- Do not require clients to store a refresh token in this change.

### 2.4 Validation and OpenAPI

- Zod schemas for auth bodies, chat resume (and chat send/stream JSON), and shopping-list JSON bodies.
- Invalid JSON or schema failures return 400 with `code: validation_error`.
- `GET /api/openapi.json` is generated from those schemas.

### 2.5 Observability

- Each request gets an id (`X-Request-Id`, honored when the client sends a safe token).
- Access logs are one JSON object per request (method, path, status, duration, request id). No bodies, no `Authorization`.
- Error envelopes include `code` from a catalog and `requestId`.

### 2.6 Shopping list sync

- Optional `Idempotency-Key` on create, update, and delete. Same user + key replays the original status and body.
- Optional expected version. Mismatch is 409 with the current row. Omitted version keeps last-write-wins.
- Responses include `version`. Old clients that ignore it keep working.

### 2.7 CI

- Typecheck and unit tests run and pass before D1 migrations and Worker deploy.
- Pull requests run the check job and do not deploy.

### 2.8 Migrations

- Additive only (new columns with defaults, new tables). No drops, no rewrites of existing columns.

## 3. Edge cases

- Legacy hashes without the version prefix keep verifying until the next successful login.
- Rehash failure must not block an otherwise successful login.
- Idempotency key reused for a different method or path returns 409 `idempotency_key_reused`.
- In-flight duplicate key returns 409 `idempotency_in_progress` until the first request stores a body.
- Keys are retained 24 hours, then may be reused.
- Version check on a missing row is 404, not 409.
- PUT/DELETE may send the expected version in the body (PUT), query (DELETE), or `X-Expected-Version`. If two sources disagree, 400.

## 4. Security

- PBKDF2 iterations default to 100,000 (Workers CPU budget; still far slower than one HMAC).
- Password length capped at 256 characters before the KDF.
- Rate-limit subjects are SHA-256, not raw IPs or emails.
- Unknown-email sign-in still runs a PBKDF2 compare against a dummy hash.
- Request ids that contain characters outside `[A-Za-z0-9._:-]` are replaced.

## 5. Success criteria

- [x] New hash verifies; legacy hash verifies and reports rehash; login rewrites the stored hash
- [x] Auth routes return 429 after the configured limit
- [x] Shopping create replay does not insert a second row
- [x] Version mismatch returns 409 with `code: version_conflict` and the current item
- [x] OpenAPI document lists the changed operations
- [x] CI `check` job is required by migrate and deploy
- [x] Existing domain CRUD tests still pass without sending the new headers
