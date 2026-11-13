# Bug: AI ?œupdate recipe??creates a duplicate under Uncategorized

**Status:** Resolved  
**Severity:** Major  
**Type:** Agent tools / product contract  
**Surface:** Chat agent (`createRecipe` only)

---

## Current behavior

User asks to update an existing recipe (e.g. Chicken Fried Rice). Agent calls `createRecipe` again ??second recipe, often without folder (Uncategorized).

## Expected behavior

Updates apply in place via `updateRecipe` (or explicit ?œmake another copy??. No silent duplicate for the same meal name when the user said ?œupdate.??

## Reproduction

1. Create Chicken Fried Rice (3 ingredients).  
2. Ask AI to update it with more ingredients.  
3. Observe a second recipe with 6 ingredients under Uncategorized.

## Related files

- `backend-cf/src/agent/tools/definitions.ts`
- `backend-cf/src/agent/tools/execute.ts`
- `backend-cf/src/db/recipe.ts` (`updateRecipe`)
- `backend-cf/src/agent/system-prompt.ts`

## Impact

Recipe library fills with duplicates; users lose the ?œone recipe??mental model.
