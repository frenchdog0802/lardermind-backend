# Task 02: `planMeals` executor

**Depends on:** 01  
**Repo:** `backend-cf/`

## Goal

Execute batch meal-plan creates with a hard cap and structured result for the agent loop.

## Work

1. Implement `case 'planMeals'` in `execute.ts` using existing `createMealPlan` / `toMealPlanDto` / recipe name resolution (mirror `addRecipeToMenu`).
2. Cap at **28** meals; set `truncated: true` when truncated.
3. Collect per-item errors; still create valid items.
4. Return `cardType: meal_plan_updated` and `cardData` with `mealsScheduled` + `meals` for clients.

## Acceptance

- [ ] Happy path creates N plans and returns card data
- [ ] Invalid item does not abort siblings
- [ ] >28 meals truncates with `truncated: true`
- [ ] Vitest covers the above with mocked D1 / helpers

## Test

Fail-first or direct Vitest on execute `planMeals`.
