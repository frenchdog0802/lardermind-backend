# 01 — Passwords and auth rate limits

**Status:** done

## Work

- Versioned PBKDF2-SHA256 in `src/lib/password.ts`
- Rehash legacy HMAC-SHA1 on successful `signInUser`
- D1 `auth_rate_limits` and limits on signup, signin, Google login/callback
- Tests: rehash flag, sign-in rewrite, 429 after the window is full

## Acceptance

- Legacy hash still matches and sets `needsRehash`
- New hash matches; a lower iteration count sets `needsRehash`
- `signInUser` persists a `pbkdf2-sha256$` string
- Sign-in route returns 429 `rate_limited` when the email window is already exhausted
- Existing JWT issue path is unchanged
