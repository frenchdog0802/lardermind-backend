# Task 02: Batch sync and unsync endpoints

**Feature:** shopping-pantry-batch-sync  
**Depends on:** 01  
**Files:** `backend-cf/src/db/shopping-list.ts`, `backend-cf/src/routes/shopping-list.ts`

## Goal

Add explicit APIs to merge checked shopping rows into pantry and reverse.

## Work

1. Implement `syncItemsToPantry(db, userId, items[])` per design §2.4.
2. Implement `unsyncItemsFromPantry(db, userId, itemIds[])`.
3. Routes:
   - `POST /api/shopping-list/sync-to-pantry`
   - `POST /api/shopping-list/unsync-from-pantry`
4. Validate: max 100 items; auth; skip reasons in response body.

## Acceptance criteria

- [ ] Sync merges qty/unit (with optional override) and sets flag `1`
- [ ] Second sync of same id returns `skipped: already_synced`
- [ ] Unsync subtracts pantry qty (floor 0) and clears flag
- [ ] Unchecked items skipped with `not_checked`
