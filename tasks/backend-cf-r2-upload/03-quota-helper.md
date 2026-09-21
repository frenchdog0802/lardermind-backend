# Task 03: Image upload quota helper

**Phase:** 2 — API  
**Depends on:** 02  
**Blocks:** 04

## Description

Implement `checkAndIncrementImageUpload` against D1: calendar-month reset, free cap 10, Pro/admin unlimited per design.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/db/quotas.ts` |
| Edit | callers as needed (upload route in 04) |

## Acceptance criteria

- [ ] Free user: 10th upload OK, 11th forbidden
- [ ] Month rollover resets counter
- [ ] Admin (or stub Pro) skips cap
- [ ] Unit-testable without full Worker if practical
