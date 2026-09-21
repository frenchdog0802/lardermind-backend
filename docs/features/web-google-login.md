# Feature: Web Google login (`backend-cf` + frontend env)

**Status:** Implemented (`backend-cf/` routes + env; operator must deploy Worker + set Pages `VITE_GOOGLE_CLIENT_ID`)  
**Scope:** Enable **Google Sign-In on web** against Cloudflare Workers (`backend-cf/`); wire production/local env  
**Out of scope:** Mobile Google login, Nest/Postgres, changing email/password auth, new user profile fields beyond existing `google_id` / `picture`

---

## 1. Summary

Web already has GIS redirect UI (`GoogleSignInButton` → `POST {API}/api/auth/google-callback` → hash `#google_auth=`).  
`backend-cf` currently returns **501** on `google-login` and has **no** `google-callback` route.

This feature implements Google ID-token verify + user link/create on the Worker, matching the Nest contract so the existing SPA works.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platforms | **Web only** (this feature) | User confirmed; mobile later |
| Client ID | Web OAuth Client ID (user-provided) | Same value for `VITE_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` |
| Frontend origin | `https://lardermind.com` | Production SPA / `FRONTEND_URL` |
| API origin | `https://api.lardermind.com` | Production Worker; Google redirect URI target |
| Verify library | **`jose`** + Google JWKS | Already in Worker deps; no `google-auth-library` Node baggage |
| Token model | Unchanged app **JWT** Bearer | Same as email signin |
| Client Secret | **Not used** | GIS credential = ID token; no code exchange |

### What changes

| Area | Before | After |
|------|--------|-------|
| `POST /api/auth/google-login` | 501 stub | Verify ID token → `{ token, user }` |
| `POST /api/auth/google-callback` | Missing | Form `credential` → 302 to `FRONTEND_URL/#google_auth=…` |
| D1 users | `google_id` unused | Find / link / create by Google subject |
| Env | `GOOGLE_CLIENT_ID` typed unused | + `FRONTEND_URL`; both required for Google routes |
| Frontend | Old/empty Client ID possible | Use current Web Client ID in env / Pages CI |

---

## 2. Requirements

### 2.1 Backend

- Verify Google ID token (JWT with exactly two `.`):
  - Signature via Google JWKS (`https://www.googleapis.com/oauth2/v3/certs`)
  - `aud` = `GOOGLE_CLIENT_ID`
  - `iss` ∈ `https://accounts.google.com` | `accounts.google.com`
  - `email_verified` must be true
- Upsert user:
  1. By `google_id` (sub)
  2. Else by email → set `google_id` (+ `picture` if present)
  3. Else create user (random password HMAC like email signup) + `usage_quotas` row
- Issue app JWT same as email auth.
- `POST /api/auth/google-login` JSON `{ token }` → `{ success, data: { token, user } }`.
- `POST /api/auth/google-callback` form field `credential` → **302** redirect:
  - success: `{FRONTEND_URL}/#google_auth=<base64url JSON {token,user}>`
  - failure: `{FRONTEND_URL}/#google_auth_error=<urlencoded message>`
- UTF-8 safe Base64URL encoding (SPA already decodes UTF-8).

### 2.2 Frontend / ops

- Set `VITE_GOOGLE_CLIENT_ID` to the Web Client ID (local `.env` + Pages CI).
- Google Console already needs:
  - JS origins: `https://lardermind.com`, Pages, localhost Vite
  - Redirect: `https://api.lardermind.com/api/auth/google-callback` (+ local `8787`)
- No SPA code change required if redirect hash consumer already works.

### 2.3 Ops env

| Name | Where | Value shape |
|------|-------|-------------|
| `GOOGLE_CLIENT_ID` | Worker var | Web Client ID |
| `FRONTEND_URL` | Worker var | `https://lardermind.com` (no trailing slash) |
| `VITE_GOOGLE_CLIENT_ID` | Frontend / Pages | Same Client ID |
| `VITE_API_BASE_URL` | Frontend production | `https://api.lardermind.com` (no trailing slash) |

---

## 3. Non-goals

- Mobile Expo / Android / iOS OAuth clients.
- Storing or using Google Client Secret.
- Changing CORS allowlist beyond documenting Google callback as full-page POST (not XHR).
- Account linking UI / “disconnect Google”.

---

## 4. Edge cases

| Case | Behavior |
|------|----------|
| Missing / invalid ID token | 400 JSON or `#google_auth_error=` |
| `email_verified` false | Reject |
| Email exists without `google_id` | Link `google_id` and continue |
| `GOOGLE_CLIENT_ID` or `FRONTEND_URL` unset | Clear 500/400; no silent success |
| Non-ASCII names in redirect payload | UTF-8 → Base64URL (no padding) |

---

## 5. Acceptance

- [x] Unit tests: Base64URL (incl. non-ASCII) + malformed token shape (`npm test` in `backend-cf`).
- [x] Routes implemented: `google-login` + `google-callback` (no longer 501 / missing).
- [x] Mobile unchanged / out of scope.
- [ ] Operator: deploy Worker; confirm production GIS click stores JWT (requires Pages `VITE_GOOGLE_CLIENT_ID` + Console redirect already set).
- [ ] Optional local: `FRONTEND_URL=http://localhost:5173` in `.dev.vars` for Vite redirect smoke.
