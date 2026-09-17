# Task 04: Auth + JWT

**Phase:** 1 — Scaffold  
**Depends on:** 02, 03  
**Blocks:** 05–07

## Description

Signup/signin/signout with D1 users; HMAC-SHA1 password (Nest-compatible); jose JWT `{ user_id }`.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/lib/password.ts`, `jwt.ts`, `time.ts` |
| Create | `backend-cf/src/db/users.ts` |
| Create | `backend-cf/src/middleware/auth.ts` |
| Create | `backend-cf/src/routes/auth.ts` |

## Acceptance criteria

- [ ] Signup creates user + usage_quota row
- [ ] Signin returns `{ token, user }` inside `data`
- [ ] Bearer JWT protects `/api/chat/*`
