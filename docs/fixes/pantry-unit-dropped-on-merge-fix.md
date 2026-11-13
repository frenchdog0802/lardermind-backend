# Fix: Pantry unit dropped on merge

**Bug:** [pantry-unit-dropped-on-merge.md](../bugs/pantry-unit-dropped-on-merge.md)  
**RCA:** [pantry-unit-dropped-on-merge-rca.md](../rca/pantry-unit-dropped-on-merge-rca.md)

## Fix Approach

1. On merge update, pass `unit: newItem.unit` (and preferred unit when selected from catalog).  
2. On Pantry mount, call `fetchAllIngredients(null)`.  
3. Source-level / unit test asserting merge payload includes unit.

## Alternatives Considered

| Option | Why not |
|--------|---------|
| Always create new row | Duplicates pantry names |
| Backend force unit on patch | UI already has the value; omit is client bug |

## Scope of Change

- `frontend/src/components/PantryInventory.tsx`
- Small regression test

## Data Migration / Backfill

None.

## Rollback Plan

Revert PantryInventory change.

## Risk Assessment

Low. Same API already accepts unit on update.

## Regression Test Plan

Fail-first: merge path must include `unit` in update payload (source assert or unit test).
