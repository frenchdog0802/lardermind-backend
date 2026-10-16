# Task 11: Confirm deduct lifecycle assertion

**Depends on:** 10 (optional parallel)  
**Repo:** `backend-cf/`

## Goal

Named lifecycle test: schedule does not deduct; confirm deducts recipe qty and sets `CONFIRMED`. Extend existing domain-crud coverage if already sufficient — do not duplicate blindly.

## Work

1. Read `domain-crud.test.ts` confirm path.
2. If already asserts qty drop + status, add a short comment / alias test name for “closed-loop lifecycle” discoverability OR one focused case for partial stock.
3. If thin, add explicit plan-then-confirm without intermediate pantry write.

## Acceptance

- [ ] Confirm path covered with clear test name
- [ ] Scheduling path still does not call pantry update

## Test

```bash
cd backend-cf && npm test -- domain-crud
```
