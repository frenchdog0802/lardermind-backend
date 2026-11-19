# Fix design: side dishes dropped / empty-name meal_plans row

- System prompt + `planMeals` tool description: one entry per proposed dish per day, same date+meal_type for main+side, no rotation/dropping/swapping, name-only sides allowed (calendar-only, not pantry-checked), report deviations; reconcile with `savedBySlot`.
- `planMeals` result adds `savedBySlot` so the model can verify against its proposal. (A hard server-side check against the proposal is not practical: the proposal is free text.)
- `createMealPlan`/`updateMealPlan`: blank name -> linked recipe name, else `EmptyMealNameError` (REST 400, `addRecipeToMenu` tool error). Legacy blank rows are still editable (cancel/confirm) and self-heal from their recipe when touched.
- Alternatives rejected: schema change / unique key (not needed); DB migration to delete legacy ghost rows (needs per-row judgment).
- Rollback: revert commit; no schema change.
- Tests: `src/db/meal-plan-side-dishes.test.ts`, `src/agent/system-prompt.test.ts`.
