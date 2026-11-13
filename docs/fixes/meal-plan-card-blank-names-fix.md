# Fix: Meal plan card blank names

**Bug:** [meal-plan-card-blank-names.md](../bugs/meal-plan-card-blank-names.md)  
**RCA:** [meal-plan-card-blank-names-rca.md](../rca/meal-plan-card-blank-names-rca.md)

## Fix Approach

Widen meal row type to camelCase + snake fallback; render  
`recipeName ?? meal_name`, `mealType ?? meal_type`, `servingDate ?? serving_date`.

## Alternatives Considered

| Option | Why not |
|--------|---------|
| Change backend meals[] to snake_case | Breaks camelCase contract used elsewhere |
| Dual emit both shapes | Redundant if UI accepts both |

## Scope of Change

- `frontend/src/components/AICookingAssistant.tsx` (+ source test)

## Rollback Plan

Revert UI mapping.

## Risk Assessment

Low.

## Regression Test Plan

Source assert meals list uses `recipeName ??` / `meal_name` fallback.
