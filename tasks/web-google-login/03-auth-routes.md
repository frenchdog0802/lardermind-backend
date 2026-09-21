# Task 03: google-login + google-callback routes

**Phase:** 1 — Core  
**Depends on:** 01, 02  
**Blocks:** 05, 06

## Description

Replace 501 stub with real `POST /api/auth/google-login`. Add `POST /api/auth/google-callback` form handler with 302 to `FRONTEND_URL` hash payloads.

## Files

| Action | Path |
|--------|------|
| Edit | `backend-cf/src/routes/auth.ts` |

## Acceptance criteria

- [ ] `google-login` returns `{ token, user }` envelope on success
- [ ] Callback 302 success / error hashes match SPA consumer
- [ ] Misconfigured env returns clear failure (no silent 200)
