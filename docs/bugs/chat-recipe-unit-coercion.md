# Bug: AI recipe ingredients saved with wrong units (ml vs cups)

**Status:** Resolved  
**Severity:** Major  
**Type:** Agent args / prompt  
**Surface:** `createRecipe` ingredient parsing

---

## Current behavior

Recipe text says ??.5 cups rice, 1 tbsp soy?? stored ingredients become ml/servings-like values that do not match.

## Expected behavior

Ingredient `unit` strings from the model match the recipe language (cups/tbsp/g). No silent unit-system conversion. Missing unit must not invent a misleading unit when the text had one.

## Reproduction

1. Ask AI to create a recipe describing cups/tbsp.  
2. Open the saved recipe ingredients.  
3. Observe ml / wrong quantities.

## Related files

- `backend-cf/src/agent/tools/execute.ts` (`ingredientInputsFromArgs`)
- `backend-cf/src/agent/tools/definitions.ts`
- `backend-cf/src/agent/system-prompt.ts`

## Impact

Pantry matching and shopping shortages break; users distrust AI recipes.
