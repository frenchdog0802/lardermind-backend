# Bug: Shopping list check does not add to kitchen inventory

**Status:** Resolved  
**Resolved by:** `backend-cf` shopping check ↔ pantry sync (`has_been_added_to_pantry`, migration `0007_shopping_pantry_sync.sql`)  
**RCA:** `docs/rca/shopping-check-no-pantry-sync-rca.md`  
**Fix design:** `docs/fixes/shopping-check-no-pantry-sync-fix.md`  

---

## Current Behavior

On the shopping list, marking an item as purchased (checkbox / strikethrough, or **Complete all**) leaves the item checked on the list, but the **Kitchen Inventory** remains empty (e.g. "0 items" / "找不到項目"). No separate confirm step is required by the UI; checking appears to be the purchase action.

## Expected Behavior

Checking a shopping list item (including Complete all) should add that item’s quantity to the user’s pantry / kitchen inventory. Unchecking should reverse the quantity change. Re-checking the same item must not double-add.

## Reproduction Steps

1. Open the app (web or mobile) signed in against the Cloudflare API.
2. Open **購物清單** / Shopping List.
3. Add an item if needed (e.g. `蒜頭`, quantity `1`, unit `包`), or use an existing unchecked item.
4. Check the item as purchased (or tap **Complete all**).
5. Open **廚房庫存** / Kitchen Inventory.
6. Observe: inventory still empty / item not present; shopping list still shows the item checked with strikethrough.

## Environment

- App: web (`frontend/`) and/or mobile (`mobile/`)
- API: Cloudflare Worker `backend-cf` (e.g. production `https://api.lardermind.com/api/`)
- Client path: shopping list toggle → `PUT /api/shopping-list/:id` with `checked: true` → pantry list `GET /api/pantry-item`

## Related Files

- `frontend/src/components/ShoppingList.tsx` / `mobile/src/screens/ShoppingListScreen.tsx` — check / Complete all
- `frontend/src/contexts/pantryContext.tsx` / `mobile/src/contexts/pantryContext.tsx` — `updateShoppingListItem`, refresh pantry
- `backend-cf/src/routes/shopping-list.ts` — `PUT /api/shopping-list/:id`
- `backend-cf/src/db/shopping-list.ts` — `updateShoppingListItem`
- `backend-cf/src/db/pantry.ts` — pantry create / merge-add
- `backend-cf/migrations/0004_domain_crud.sql` — `shopping_list_items` schema

## Impact Scope

- Breaks the core “bought groceries → inventory” loop for all clients on `backend-cf`.
- Users must manually add pantry items (or use chat / vision) after shopping.
- Web copy historically claimed pantry was updated on purchase, which mismatches current API behavior.

## Reproducibility Notes

- Confirmed via UI screenshots: shopping item checked; inventory empty.
- Confirmed via code: shopping update only persists `checked` on `shopping_list_items`; no pantry write on that path.

## Additional Information Needed (optional)

- None required to proceed; product docs already define expected sync semantics.

## Related Documents

- `PROJECT_STATUS.md` — Shopping list ↔ pantry sync via `has_been_added_to_pantry`
- `docs/Overall Project Structure.md` — Shopping check → pantry flow
- `docs/design/backend-cf-domain-crud-design.md` — domain CRUD without check→pantry side effect
- `docs/bugs/inventory-add-fails.md` — related pantry cutover history (CRUD restored separately)
