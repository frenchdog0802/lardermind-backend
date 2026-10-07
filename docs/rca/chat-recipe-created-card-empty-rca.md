# RCA: Recipe card shows 0 ingredients · 0 steps after createRecipe success

**Bug:** `docs/bugs/chat-recipe-created-card-empty.md`  
**Status:** Confirmed via code inspection + screenshot  

---

## Root Cause

**Client/server card contract mismatch for `recipe_created`.**

Backend `executeTool` `createRecipe` returns:

```ts
cardData: { recipe }  // RecipeDto: { id, meal_name, ingredients, instructions, ... }
```

Web/mobile recipe cards read **flat** fields:

- `recipeId`
- `recipeName`
- `ingredientCount`
- `steps`

So even when D1 insert succeeds and `RecipeDto` is fully populated, the UI falls back to:

- missing name → `Recipe:`
- `ingredientCount ?? 0` → **0**
- `steps ?? []` → **0 steps**
- missing `recipeId` → Edit / Add-to-dinner no-ops

The assistant **text** can still truthfully list names from the tool result / follow-up LLM turn, which produces the “success in dialogue, empty card” discrepancy.

## Contributing Factors

1. `createRecipe` tool schema only **requires** `meal_name`; `ingredients` / `instructions` are optional. The model can create name-only shells. That is a second, softer failure mode (real empty content), but it does **not** explain a blank name on the card when `meal_name` was in the Approve summary — the flat-field mismatch does.
2. `aggregateCard` for N× same mutating type keeps **only the last** event’s `data`, so a 7× `createRecipe` batch surfaces one card (last recipe) even after shape is fixed.
3. Related HITL client bug (`chat-hitl-approve-detached`) adds noise (false interrupt error) in the same flows but is not what zeros the card fields.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/agent/tools/execute.ts` | Emits nested `{ recipe }` |
| `frontend/.../AICookingAssistant.tsx` | Expects flat card fields |
| `mobile/.../ChatMessageRow.tsx` | Same |
| `backend-cf/src/agent/tools/cards.ts` | Passes through execute `data` unchanged |

Same nested-vs-flat pattern exists for other tools (`{ plan }`, `{ preferences }`) vs UI flat fields — out of primary repro but same class.

## Data / State Impact

Writes via `createRecipe` → D1 can succeed. Cards and history `cardData` are stored in the nested shape, so reloading history still shows empty cards until payload shape is fixed (old messages may remain wrong unless remapped on read).

## Timeline

CF chat tools executors returned domain DTOs nested under keys; web/mobile cards were written earlier against a flat Nest/LangGraph-era card shape and never reconciled.

## Why it wasn't caught earlier

- Vitest HITL/card tests assert `{ recipe: { id } }` nesting, not client field names.
- Manual checks may open Recipes list (names present) without scrutinizing chat card counts.

## Plausible alternatives (ranked)

1. **Confirmed:** Flat vs nested cardData → UI always shows 0 / empty name.
2. **Possible concurrent:** Model called `createRecipe` with only `meal_name` → real 0 ingredients in D1; still would not blank `recipeName` if card mapped `meal_name`.
3. Less likely: Approve never executed — would not produce durable success copy + `recipe_created` card from resume; screenshot shows post-success card chrome.
4. Unrelated to pantry hallucination bug — here tools/HITL did run (Approve list visible).
