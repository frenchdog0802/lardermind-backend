# RCA: Meal plan card blank names

**Bug:** [meal-plan-card-blank-names.md](../bugs/meal-plan-card-blank-names.md)

## Root cause

`mealPlanUpdatedCardData` emits camelCase (`recipeName`, `mealType`, `servingDate`). The web card maps `meals[]` with snake_case (`meal_name`, `meal_type`, `serving_date`), so fields are undefined and render as empty strings around `·`.

## Contributing Factors

Top-level single-meal fields already use camelCase and work; only the list path is wrong. Same class of bug as empty recipe/suggestion cards previously fixed.

## Affected Components

Web AICookingAssistant meal_plan_updated list (mobile if same pattern).

## Data / State Impact

None — display only; calendar rows are correct.

## Timeline

Since card helper standardized on camelCase.

## Why it wasn't caught earlier

Single-meal schedule uses top-level fields; multi-meal QA was rarer.
