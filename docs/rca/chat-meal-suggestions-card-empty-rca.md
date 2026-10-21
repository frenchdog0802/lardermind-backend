# RCA: Meal suggestions card blank names / "% match"

**Bug:** `docs/bugs/chat-meal-suggestions-card-empty.md`  
**Status:** Confirmed via code inspection + screenshot  

---

## Root Cause

**Client/server card contract mismatch for `meal_suggestions`.**

Backend `suggestMealsFromPantry` returns:

```ts
cardData: {
  suggestions: Array<{
    id, meal_name, score, matchedIngredients, missingIngredients, cookable, image
  }>
}
```

Web/mobile meal-suggestion rows read **flat client fields** per item:

- `recipeName` (display name)
- `matchScore` (display as `{matchScore}% match`)
- `recipeId` (typed; not required for current JSX)

So when suggestions exist and the LLM text lists names correctly from tool **content**, the UI still renders:

- missing `recipeName` → blank span
- missing `matchScore` → interpolates to **`% match`**

`cards.ts` already has mappers for `recipe_created` / `meal_plan_updated` (`recipeCreatedCardData`, `mealPlanUpdatedCardData`) but **no** mapper for meal suggestions; execute passes the LLM-oriented suggestion objects straight into `cardData`.

## Contributing Factors

1. Backend `score` is a **sort key** (`matched.length + (cookable ? 100 : 0)`), not a 0–100 display percentage. Even a naive rename `score` → `matchScore` would show values like `102% match` for cookable recipes.
2. Prior fix for `chat-recipe-created-card-empty` warned of the same contract class for other tools; meal suggestions was left unmapped.
3. Client `normalizeRecipeCardData` only remaps nested `{ recipe }` for recipe cards — it does not remap suggestion item fields.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/agent/tools/execute.ts` | Emits `id` / `meal_name` / `score` in `cardData.suggestions` |
| `backend-cf/src/agent/tools/cards.ts` | No `mealSuggestionsCardData` helper |
| `frontend/.../AICookingAssistant.tsx` | Expects `recipeName` / `matchScore` |
| `mobile/.../ChatMessageRow.tsx` | Same |

## Data / State Impact

Tool execution and pantry scoring can succeed. Cards and history store the backend-shaped suggestions, so reload still shows empty rows until payload shape is fixed (old messages may remain wrong unless remapped on read).

## Timeline

`suggestMealsFromPantry` was wired for kitchen closed-loop cookable scoring with DTO-ish fields; web/mobile cards were written against flat Nest/LangGraph-era names and never reconciled for this card type.

## Why it wasn't caught earlier

- `execute-suggest-cookable.test.ts` asserts tool **content** ranking (`id`, `cookable`) — not client card field names.
- Manual checks may read assistant prose (names present) without scrutinizing the card rows.
- HITL/card tests only use empty `{ suggestions: [] }` for aggregation.

## Plausible alternatives (ranked)

1. **Confirmed:** Field-name mismatch (`meal_name`/`score` vs `recipeName`/`matchScore`) → blank name and `% match`.
2. **Not this repro:** Empty `suggestions` array — would show title + button with **no** rows; screenshot shows rows with `% match`.
3. Unrelated to recipe-create empty card — different card type, same contract class.
