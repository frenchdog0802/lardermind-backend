# Task 03: API regression tests

**Feature:** shopping-pantry-batch-sync  
**Depends on:** 01, 02  
**Files:** `backend-cf/src/routes/domain-crud.test.ts` (or focused shopping test file)

## Goal

Fail-first Vitest coverage for the new contract.

## Tests

1. Check does not add to pantry.
2. Batch sync adds once; idempotent resync skips.
3. Unsync restores pantry quantity.
4. Sync with quantity override uses override.
5. Create with `checked: true` does not sync until batch.
6. Sync unchecked item → skipped.

## Acceptance criteria

- [ ] All new tests pass
- [ ] Old check→pantry tests removed or rewritten
- [ ] `npm test` (or project test command) green for shopping/pantry scope
