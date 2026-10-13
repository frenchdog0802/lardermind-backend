# Task 01: Decouple check from pantry sync

**Feature:** shopping-pantry-batch-sync  
**Depends on:** —  
**Files:** `backend-cf/src/db/shopping-list.ts`, `backend-cf/src/routes/shopping-list.ts`

## Goal

Stop writing to pantry when shopping items are checked or unchecked. Preserve `has_been_added_to_pantry` column; only batch endpoints mutate it (plus existing legacy rows).

## Work

1. Remove `syncPantryOnCheck` / `syncPantryOnUncheck` calls from `createShoppingListItem` and `updateShoppingListItem`.
2. Do not set `has_been_added_to_pantry = 1` on create with `checked: true`.
3. Add `synced_to_pantry: boolean` to `ShoppingListItemDto` (from column).
4. Update route serializers if needed.

## Acceptance criteria

- [ ] PUT `checked: true` leaves pantry unchanged and `synced_to_pantry: false`
- [ ] PUT `checked: false` on synced row leaves pantry unchanged (unsync is separate endpoint)
- [ ] Existing tests that assert check→pantry are marked failing / removed in task 03

## Notes

Keep `syncPantryOnCheck` / `syncPantryOnUncheck` helpers for reuse in task 02.
