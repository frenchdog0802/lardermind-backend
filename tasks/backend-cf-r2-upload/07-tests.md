# Task 07: Upload / media tests

**Phase:** 3 — Docs & verify  
**Depends on:** 03–05  
**Blocks:** 08

## Description

Add automated tests for upload happy path, MIME/size reject, quota 403, owner delete, cross-user delete 403, media GET. Mock or use local bindings as the repo’s test setup allows.

## Files

| Action | Path |
|--------|------|
| Create/Edit | `backend-cf` test files (match existing harness) |

## Acceptance criteria

- [ ] Tests cover design §6 cases (or document any harness gap)
- [ ] `npm test` (or project equivalent) passes in `backend-cf/`
