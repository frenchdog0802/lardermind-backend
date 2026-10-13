# Task 05: Mobile batch sync UI

**Feature:** shopping-pantry-batch-sync  
**Depends on:** 02  
**Files:** `mobile/src/screens/ShoppingListScreen.tsx`, `mobile/src/contexts/pantryContext.tsx`, `mobile/src/api/shoppingList.ts`

## Goal

Parity with web batch sync entry point and sync state badges.

## Work

1. Same pending/synced visual hints as web.
2. Footer CTA opens review sheet (task 06).
3. If offline: disable batch sync with message (sync endpoint requires network).

## Acceptance criteria

- [ ] Online batch sync works end-to-end
- [ ] Offline: checks still work locally; batch button explains online requirement
- [ ] Pantry refresh after sync
