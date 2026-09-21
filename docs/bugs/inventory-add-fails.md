# Bug: Kitchen Inventory add item fails (list stays empty)

**Status:** Resolved  
**Resolved by:** Nest-compatible pantry CRUD on `backend-cf` (`docs/features/backend-cf-pantry-crud.md`)  
**RCA:** `docs/rca/inventory-add-fails-rca.md`  
**Fix design:** `docs/fixes/inventory-add-fails-fix.md`  

---

## Current Behavior

On the mobile **Kitchen Inventory** screen, entering an item name, choosing a unit (e.g. `pcs`), and tapping **Add** does not add the item to the list. The add form closes and the inventory area still shows **"No items found"**. There is no visible error alert for manual add.

## Expected Behavior

After tapping **Add** with a non-empty item name, the item should appear in the inventory list (persisted for the signed-in user) and remain visible after leaving/reopening the screen.

## Reproduction Steps

1. Open the mobile app (`mobile/`) signed in against the current API base URL.
2. Open **Kitchen Inventory** (drawer).
3. Tap to open the add form (if not already open).
4. Enter an item name (e.g. `egg`), leave unit as `pcs` (or pick another unit).
5. Tap **Add**.
6. Observe: form closes; list still shows **No items found**.

## Environment

- App: `mobile/` (Expo / React Native) — UI matches Kitchen Inventory add form + empty state
- OS: Android (screenshot from device/emulator)
- API: client `EXPO_PUBLIC_API_BASE_URL` → production `https://api.lardermind.com/api/`
- Client path: `PantryInventoryScreen` → `addPantryItem` → `POST …/pantry-item`

## Related Files

- `mobile/src/screens/PantryInventoryScreen.tsx` — `handleAddItem`
- `mobile/src/contexts/pantryContext.tsx` — `addPantryItem` / `fetchAllPantryItems`
- `mobile/src/api/pantryItem.ts` — `pantryItemApi.create` → `POST pantry-item`
- `frontend/src/components/PantryInventory.tsx` / `frontend/src/api/pantryItem.ts` — parallel web path
- `backend-cf/src/index.ts` — Worker route mount point

## Impact Scope

- Blocks core inventory create (and likely list/update/delete) on clients pointed at Cloudflare API.
- Manual add fails silently on mobile (form closes with no Alert).
- Web path uses the same `pantry-item` contract and is expected to fail similarly.

## Reproducibility Notes

- Screenshot confirms empty inventory after attempting add.
- Independent probe of production: `POST https://api.lardermind.com/api/pantry-item` returns HTTP **404** with body `{"success":false,"message":"Not found"}`.

## Additional Information Needed (optional)

- Whether local `wrangler dev` was ever used with a Nest/legacy backend that still had pantry routes
- Whether web Inventory against the same API base also fails at the same time (expected yes)

## Related Documents

- `docs/design/backend-cf-api-design.md` — `pantry_items` schema only; CRUD later
- `docs/features/pantry-image-recognition.md` — Nest `/api/pantry-item` contract reference
- `backend-cf/README.md` — Pantry listed as “Not yet”
- `docs/features/backend-node-migration.md` — historical Nest pantry routes
