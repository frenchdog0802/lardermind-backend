# Task 07: Subscription stub

**Phase:** 2 — AI chat  
**Depends on:** 04  
**Blocks:** none

## Description

Minimal `GET /api/subscription/plans` and `GET /api/subscription/status` so web boot does not 404.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/routes/subscription.ts` |

## Acceptance criteria

- [ ] Plans catalog matches Nest product ids shape
- [ ] Status returns free tier defaults for new users
