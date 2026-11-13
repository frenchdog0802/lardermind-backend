# Bug: Web API client uses empty base URL (guest mint fails on landing)

**Status:** Resolved  
**Severity:** Critical  
**Type:** Integration / build-time env  
**Surface:** Web SPA (`frontend/src/api/client.ts`) → all `api.*` calls including `POST /api/auth/guest`

---

## Current behavior

On production landing (`https://lardermind.com`), the Live try guest chat shows mint failure (“Couldn’t start a guest session” / localized equivalent).

Network: browser calls **`https://lardermind.com/api/auth/guest`** (same origin) → **405** empty body → client JSON parse throws → GuestChatBox catch path.

Direct API works: `POST https://api.lardermind.com/api/auth/guest` → 200 + guest JWT.

## Expected behavior

All `api.*` requests (including guest mint) go to the Workers origin baked in at build time (`https://api.lardermind.com`), same as `chat.ts` / `ImageUploader.ts`.

## Reproduction

1. Open production landing while logged out (or clear guest session).
2. Open DevTools Network; watch `POST …/api/auth/guest`.
3. Observe request to **Pages host** (not `api.lardermind.com`) and mint error in UI.

## Related files

- `frontend/src/api/client.ts` (`readApiBaseUrl` via `meta.env?.VITE_API_BASE_URL`)
- `frontend/src/api/chat.ts` (direct `import.meta.env.VITE_API_BASE_URL` — works)
- `frontend/src/components/GuestChatBox.tsx` (consumer)
- `docs/features/frontend-cf-pages.md` (bake `VITE_API_BASE_URL` at build)

## Impact

Guest first-win on landing is broken. Any other call that uses `api` from `client.ts` (signup, signin, CRUD) is also broken on production if this build is live — streaming chat may still work via `chat.ts`’s separate BASE_URL.
