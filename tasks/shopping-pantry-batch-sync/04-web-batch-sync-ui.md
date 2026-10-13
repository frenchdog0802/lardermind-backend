# Task 04: Web batch sync UI

**Feature:** shopping-pantry-batch-sync  
**Depends on:** 02  
**Files:** `frontend/client/src/` — shopping list component, API module, `pantryContext.tsx`

## Goal

Shopping list shows pending sync state and entry point for batch sync.

## Work

1. Parse `synced_to_pantry` on shopping DTOs.
2. Show badge: 待入庫 / 已入庫 per row where applicable.
3. Footer button when `checked && !synced_to_pantry` count > 0: **將 N 項加入庫存**.
4. Wire API `syncToPantry` / refresh pantry + shopping list on success.

## Acceptance criteria

- [ ] Checking items does not change pantry view
- [ ] CTA count matches pending rows
- [ ] After confirm (task 06), pantry updates
