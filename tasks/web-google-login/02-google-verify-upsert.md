# Task 02: Google ID token verify + user upsert

**Phase:** 1 — Core  
**Depends on:** 01  
**Blocks:** 03, 05

## Description

Implement `verifyGoogleIdToken` with `jose` + Google JWKS. Implement `findUserByGoogleId` and `upsertGoogleUser` (find by sub → link by email → create) per design.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/lib/google-id-token.ts` |
| Create | `backend-cf/src/lib/base64url.ts` |
| Edit | `backend-cf/src/db/users.ts` |

## Acceptance criteria

- [ ] Verifies `aud` / `iss` / `email_verified`
- [ ] Rejects malformed non-JWT strings before JWKS
- [ ] Upsert links existing email users and creates new rows + `usage_quotas`
- [ ] `encodeBase64UrlJson` UTF-8 safe
