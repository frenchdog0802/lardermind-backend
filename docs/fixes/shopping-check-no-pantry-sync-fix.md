# Fix design: Shopping list check does not add to kitchen inventory

**Bug:** `docs/bugs/shopping-check-no-pantry-sync.md`  
**RCA:** `docs/rca/shopping-check-no-pantry-sync-rca.md`  

---

## Fix Approach

Restore server-side shopping ↔ pantry sync on `backend-cf` (smallest root-cause fix):

1. **Schema:** additive migration `0007_shopping_pantry_sync.sql`  
   - `ALTER TABLE shopping_list_items ADD COLUMN has_been_added_to_pantry INTEGER NOT NULL DEFAULT 0`
2. **Create:** if item is created with `checked: true`, `mergeAddPantryItem` then set flag `1`.
3. **Update (check transition):**
   - `checked` false→true **and** flag `0` → `mergeAddPantryItem` with shopping name/qty/unit/`ingredient_id`, set flag `1`
   - `checked` true→false **and** flag `1` → subtract shopping qty from matching pantry row (by `ingredient_id` then name CI), floor at `0`, set flag `0`; if no pantry row, still clear flag
   - Already checked + flag `1` → no pantry change (idempotent)
   - Legacy checked row with flag `0` (after migration) → next PUT with `checked: true` (or any update that keeps checked true and runs sync) should add once — implement sync whenever `checked === true && flag === 0` after patch apply, and whenever `checked === false && flag === 1`
4. **Wire:** keep sync inside `db/shopping-list.ts` (or a small helper used by create/update) so routes stay thin; reuse `mergeAddPantryItem` / `updatePantryItem` / `findByIngredientId` / `findByNameCi` from `db/pantry.ts`.
5. **DTO:** do **not** require clients to send the flag; optional omit from response unless already convenient (internal column is enough for this bug).

Why this approach: matches documented Spring/`has_been_added_to_pantry` contract; clients already refresh pantry after toggle; no client contract change.

## Alternatives Considered

| Alternative | Verdict |
|-------------|---------|
| Client calls `POST /api/pantry-item` on check | Rejects — duplicates logic on web+mobile; races; no shared flag |
| New “Finish shopping” API | Larger UX change; not the documented contract |
| Toast-only / copy fix | **Workaround** — does not restore inventory |
| Backfill all currently checked items into pantry on migrate | Optional; risk of surprising bulk adds — **out of scope** (default flag 0; user can toggle or re-check) |

## Scope of Change

- `backend-cf/migrations/0007_shopping_pantry_sync.sql`
- `backend-cf/src/db/shopping-list.ts` — column + sync on create/update
- `backend-cf/src/routes/domain-crud.test.ts` — mock UPDATE shopping + fail-first sync tests; extend INSERT bind if column added
- Docs: mark bug Resolved when shipped
- **Out of scope:** Nest zero-qty pantry row on every shopping create; client copy polish; offline flag exposure; production backfill of already-checked items

## Data Migration / Backfill Needs

Additive column default `0` only. No automatic backfill of pantry from currently checked rows (avoids unexpected inventory spam). Users can uncheck/re-check once, or add manually.

## Rollback Plan

- Revert Worker deploy that includes sync logic.
- Column may remain (harmless default 0). Dropping column only if a down-migration is explicitly needed.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Double-add on repeated PUT | Gate on `has_been_added_to_pantry` |
| Uncheck when pantry missing | Clear flag; no error |
| Unit mismatch on merge | Same as existing `mergeAddPantryItem` (keep pantry unit) |
| Mock DB incomplete for UPDATE | Extend `domain-crud.test.ts` shopping UPDATE path |
| Subtract below zero | Floor at 0 |

## Regression Test Plan

Fail-first Vitest in `domain-crud.test.ts` (or focused shopping test):

1. Create unchecked shopping item → pantry empty  
2. PUT `checked: true` → pantry has item with shopping quantity; second PUT still checked → quantity unchanged  
3. PUT `checked: false` → pantry quantity restored (subtracted)  
4. Create with `checked: true` → pantry gains quantity once  

Manual: check garlic on shopping list → Kitchen Inventory shows it; uncheck → quantity removed/restored.
