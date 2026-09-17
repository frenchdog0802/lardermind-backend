# Task 11: Unit tests

**Phase:** 4 — Verify  
**Depends on:** 02, 03, 04  
**Blocks:** 12

## Description

Backend unit tests for mergeAddItem and vision parse/service with mocked OpenAI/quota. Optional mobile payload shaping test.

## Files

| Action | Path |
|--------|------|
| Create/Modify | `backend-node/src/pantry-items/pantry-items.service.spec.ts` |
| Create | `backend-node/src/pantry-vision/pantry-vision.service.spec.ts` |

## Acceptance criteria

- [ ] `npm test` (backend-node) covers merge + vision happy/error paths
- [ ] No real OpenAI network calls in unit tests
