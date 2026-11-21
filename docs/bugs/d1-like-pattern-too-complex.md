# Bug: D1 "LIKE or GLOB pattern too complex" on meal-plan approve

- **Current:** Approving a meal-plan proposal that saves 7 recipes fails with `D1_ERROR: LIKE or GLOB pattern too complex`; only 2 of 7 recipes save. Adding the plan's ingredients to the shopping list fails with the same error.
- **Expected:** All recipes save and shortages are added to the shopping list, regardless of name length.
- **Repro:** `createRecipe` tool with a `meal_name` longer than ~48 bytes (see `src/db/like-pattern-limit.test.ts`).
- **Severity:** Critical (core plan flow partially fails, leaves partial writes).
- **Related files:** `src/db/{recipe,shopping-list,ingredient,folder,meal-plan}.ts`, `src/agent/tools/execute.ts`.
