# Task 06: Sync review sheet

**Feature:** shopping-pantry-batch-sync  
**Depends on:** 04 or 05 (implement on both platforms)  
**Files:** Web shopping list modal; mobile bottom sheet / modal

## Goal

Lightweight confirmation UI before writing pantry.

## Work

1. List all `checked && !synced_to_pantry` items.
2. Checkbox per row — **default checked if `ingredient_id` present**, else unchecked.
3. Editable quantity + unit (prefilled from shopping row).
4. Hint copy for rows without `ingredient_id`.
5. Confirm builds `{ items: [{ id, quantity?, unit? }] }` for API.

## Acceptance criteria

- [ ] User can exclude toilet paper / manual non-food by default
- [ ] User can include manual food by checking row
- [ ] Qty/unit edits sent on confirm
- [ ] Cancel closes without API call
