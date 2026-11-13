# RCA: Chat recipe unit coercion

**Bug:** [chat-recipe-unit-coercion.md](../bugs/chat-recipe-unit-coercion.md)

## Root cause

1. Prompt does not require preserving the user’s/measurement-system units in `createRecipe` args.  
2. `ingredientInputsFromArgs` defaults missing unit to `pcs`, and schema marks unit optional — model may omit or “normalize” to metric.

## Contributing Factors

No validation that unit is present when quantity > 0.

## Affected Components

createRecipe / updateRecipe ingredient ingest.

## Data / State Impact

Wrong units persisted on recipe_ingredients.

## Timeline

Long-standing default `pcs` + weak prompt.

## Why it wasn't caught earlier

Happy-path demos use pcs-friendly ingredients.
