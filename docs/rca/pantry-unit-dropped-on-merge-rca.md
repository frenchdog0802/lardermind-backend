# RCA: Pantry unit dropped on merge

**Bug:** [pantry-unit-dropped-on-merge.md](../bugs/pantry-unit-dropped-on-merge.md)

## Root cause

`handleAddItem` updates an existing row with `{ ...existingItem, quantity: newItem.quantity }` and **omits `unit`**. Catalog search uses `ingredients` from context, but Pantry never calls `fetchAllIngredients`, so the list stays empty.

## Contributing factors

Create path spreads `newItem` (includes unit), masking the merge bug. RecipeManager loads ingredients; Pantry does not.

## Affected components

Web Pantry add/merge; ingredient typeahead.

## Data / State Impact

Existing rows keep stale units until a full replace path is used.

## Timeline

Present since merge-on-add UX.

## Why it wasn't caught earlier

Manual QA often adds new names (create path) rather than re-adding existing ones.
