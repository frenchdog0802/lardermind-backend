# Task 02: Execute update / remove pantry items

**Phase:** 1  
**Goal:** Wire executors to D1 pantry helpers; cover happy path and edge cases in Vitest.

## Steps

1. In `execute.ts`, implement `updatePantryItems`:
   - Resolve by id (user-scoped) or name CI
   - `delta` / `mode: 'delta'` → add to current qty
   - `quantity` / `mode: 'set'` → absolute
   - `newQty <= 0` → `deletePantryItem`
   - Per-item errors; continue siblings
2. Implement `removePantryItems` via `deletePantryItem`; missing → error entry
3. Do not use negative `mergeAddPantryItem`
4. Vitest: delta reduce, set, zero-delete, remove missing, batch partial failure

## Acceptance

- [ ] Approve path mutates D1 as specified
- [ ] Card type `pantry_updated` on success path (same aggregation as add)
- [ ] Tests fail-first then pass
