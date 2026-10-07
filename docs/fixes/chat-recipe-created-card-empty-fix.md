# Fix: Emit flat `recipe_created` cardData matching clients

**Bug:** `docs/bugs/chat-recipe-created-card-empty.md`  
**RCA:** `docs/rca/chat-recipe-created-card-empty-rca.md`  

---

## Fix Approach

In `backend-cf` `executeTool` for `createRecipe`, map `RecipeDto` into the **flat** card payload clients already render:

```ts
cardData: {
  recipeId: recipe.id,
  recipeName: recipe.meal_name,
  ingredientCount: recipe.ingredients.length,
  steps: recipe.instructions, // string[]
}
```

Keep tool **content** JSON as `{ recipe }` for the LLM (full DTO is fine in the tool result string).

Add a fail-first unit test that asserts `createRecipe` cardData exposes `recipeId` / `recipeName` / `ingredientCount` / `steps` (not only nested `recipe`).

Optional same-PR hardening (same contract class, minimal):

- `addRecipeToMenu` → flat `mealPlanId` / `recipeName` / `mealType` / `servingDate` from plan DTO
- `addPantryItems` / `addItemsToShoppingList` → set `itemsAdded: items.length` alongside `items`

Why: Fix at the producer so web + mobile both work without dual client remappers; matches existing UI contracts.

## Alternatives Considered

| Option | Why not default |
|--------|-----------------|
| Remap only in web `mapResponseToMessage` | Mobile stays broken; history still stores nested shape |
| Change UI to read `cardData.recipe.*` | Two clients + any stored docs/examples; larger churn |
| Require ingredients in tool schema now | Good follow-up; does not fix blank name/count when data exists |

## Scope of Change

- `backend-cf/src/agent/tools/execute.ts` — flat cardData for `createRecipe` (+ optional sibling tools above)
- Tests under `backend-cf` for execute / HITL card shape
- Update HITL/card tests that currently expect `{ recipe: { id } }` nested card data

Out of scope: forcing the model to always fill ingredients (prompt/schema follow-up); multi-`createRecipe` → multi-card list UI; HITL placement (`chat-hitl-approve-detached`).

## Data Migration / Backfill Needs

None required. Old history rows with nested `cardData.recipe` may still render empty; acceptable, or optional client fallback:

```ts
recipeName ?? cardData.recipe?.meal_name
```

Include a thin client fallback in web/mobile recipe card mapping if cheap — labeled as compatibility for old messages, not the primary fix.

## Rollback Plan

Revert execute cardData mapping; clients unchanged for primary fix.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| LLM-facing tool message accidentally changed | Only change `cardData`, not `content` string |
| Tests lock nested shape | Update tests to flat contract |
| Multi-recipe batch still one card | Documented; last recipe card is correct after fix |

## Regression Test Plan

1. Fail-first: execute `createRecipe` with name + ingredients + steps → cardData flat fields match.
2. Resume approve path / aggregateCard still returns `recipe_created` with flat data.
3. Manual: Approve createRecipe → card shows name, N ingredients, M steps; Edit opens that recipe.
