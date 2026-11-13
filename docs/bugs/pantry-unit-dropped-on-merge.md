# Bug: Pantry unit dropped when merging into existing item

**Status:** Resolved  
**Severity:** Major  
**Type:** Logic / UI  
**Surface:** Web Pantry (`PantryInventory`); ingredient catalog search empty

---

## Current behavior

Choosing unit **g** (or kg) while adding an item that already exists in pantry saves quantity but keeps the old unit (often **pcs**). Searching the add dropdown for Rice / Chicken finds nothing because the ingredient catalog was never loaded.

## Expected behavior

Merge-update persists the unit selected in the form. Ingredient search shows catalog matches after pantry mounts.

## Reproduction

1. Add Rice as 1 pcs.  
2. Add Rice again with unit g / kg.  
3. Observe row still pcs.  
4. Open add form; type Rice ??no catalog suggestions.

## Related files

- `frontend/src/components/PantryInventory.tsx` (`handleAddItem`)
- `frontend/src/hooks/useSearchIngredient.tsx`
- `frontend/src/contexts/pantryContext.tsx`

## Impact

Users cannot record pantry in mass/volume units when the name already exists; search feels broken.
