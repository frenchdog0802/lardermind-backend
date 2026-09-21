# Task 05: Tests

**Phase:** 2 — Docs & verify  
**Depends on:** 02, 03  
**Blocks:** 06

## Description

Add Vitest coverage for Base64URL encode, token-shape guard, and upsert/link behavior where testable without live Google.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/lib/base64url.test.ts` |
| Create | `backend-cf/src/lib/google-id-token.test.ts` |
| Optional | `backend-cf/src/routes/auth-google.test.ts` |

## Acceptance criteria

- [ ] `npm test` in `backend-cf` passes
- [ ] Non-ASCII Base64URL encode covered
- [ ] Malformed token rejected without network
