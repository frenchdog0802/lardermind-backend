# Bug: Chat claims recipes created but recipe card shows 0 ingredients · 0 steps

**Status:** Resolved  
**Resolved by:** Backend `createRecipe` (and meal-plan / itemsAdded) emit flat cardData matching client fields; client fallback for nested `{ recipe }` history  
**RCA:** `docs/rca/chat-recipe-created-card-empty-rca.md`  
**Fix design:** `docs/fixes/chat-recipe-created-card-empty-fix.md`  

---

## Current Behavior

After the user Approves one or more `createRecipe` tool calls, the assistant reply can say recipes were created successfully (lists dish names), but the attached **Recipe** card shows:

- Empty / missing recipe name (`Recipe:` with nothing after the label)
- **`0 ingredients · 0 steps`**
- Edit / Add-to-dinner actions that have no usable recipe identity in the card UI

Users conclude that function calls did not actually add recipes (or added nothing useful), even when the model text claims success.

## Expected Behavior

1. After Approve, if `createRecipe` succeeds, the chat card must show the created recipe’s **name**, **ingredient count**, and **steps** (or an honest empty-content notice if the tool truly stored none).
2. **Edit Recipe** / **Add to today's dinner** must target the real created recipe id.
3. Assistant success copy must match what was persisted (no “7 recipes created” facade over empty/unusable cards).

## Reproduction Steps

1. Sign in to web Chat; ensure HITL is on.
2. Ask the assistant to create multiple side-dish recipes (or approve a pending batch of `createRecipe` tools).
3. Approve the interrupt.
4. Observe success text listing recipe names.
5. Observe the Recipe card still shows `0 ingredients · 0 steps` and little/no name.

## Environment

- Chat: web `AICookingAssistant` (screenshot); mobile `ChatMessageRow` uses the same card fields
- API: `backend-cf` `createRecipe` tool → `recipe_created` card on resume
- Locale: Traditional Chinese conversation; English card chrome

## Related Files

- `backend-cf/src/agent/tools/execute.ts` — `createRecipe` `cardData`
- `backend-cf/src/agent/tools/cards.ts` — aggregation of card events
- `backend-cf/src/db/recipe.ts` — `createRecipe` / `RecipeDto`
- `frontend/src/components/AICookingAssistant.tsx` — `renderRecipeCard` expects `recipeId` / `recipeName` / `ingredientCount` / `steps`
- `mobile/src/components/chat/ChatMessageRow.tsx` — same field names

## Impact Scope

- Breaks trust for chat-driven recipe creation (core write path).
- Edit / schedule-from-card may no-op when `recipeId` is missing from cardData.
- Same card-contract class of risk for other tools if payloads were nested under `recipe` / `plan` while UI expects flat fields.

## Reproducibility Notes

- Screenshot pair: success copy (“配菜食譜 7 道已建立完成…”) vs Recipe card `0 ingredients · 0 steps`.
- Often appears in the same session as HITL Approve for multiple `createRecipe` calls.

## Related Documents

- `docs/features/backend-cf-chat-tools.md`
- `docs/design/backend-cf-chat-tools-design.md`
- `docs/bugs/chat-pantry-add-claimed-but-empty.md` (related class: success copy vs missing persistence/UI; different root path)
- `docs/bugs/chat-hitl-approve-detached.md` (HITL UX / false interrupt error in the same flows)
