# Bug: Meal suggestions card shows blank names and "% match"

**Status:** Resolved  
**Resolved by:** Backend `suggestMealsFromPantry` emits flat cardData (`recipeId` / `recipeName` / `matchScore`); client fallback for legacy `meal_name`  
**RCA:** `docs/rca/chat-meal-suggestions-card-empty-rca.md`  
**Fix design:** `docs/fixes/chat-meal-suggestions-card-empty-fix.md`  

---

## Current Behavior

After the assistant runs pantry matching (e.g. user asks what they can cook from pantry), the chat shows a **Meal suggestions** card that:

- Lists rows with **empty** recipe names (blank left side)
- Shows literally **`% match`** on the right (no number)
- Still shows the card chrome: title "Meal suggestions" and **View Calendar** button

The assistant **text** above the card can correctly list matched recipes and missing ingredients (e.g. 山藥排骨湯 / 青木瓜排骨湯), so users see useful prose but an empty suggestion card.

## Expected Behavior

1. Each suggestion row shows the recipe **name**.
2. Each row shows a numeric match percentage (e.g. `40% match`), not a bare `% match`.
3. Card content must match what the tool / assistant text described for those recipes.

## Reproduction Steps

1. Sign in to web Chat with a pantry that has some items (e.g. 排骨) and recipes that partially overlap.
2. Ask the assistant what can be cooked from the current pantry (or otherwise trigger `suggestMealsFromPantry`).
3. Observe assistant text listing recipes / shortages.
4. Observe the **Meal suggestions** card: blank names and `% match` placeholders.

## Environment

- Chat: web `AICookingAssistant` (screenshot); mobile `ChatMessageRow` uses the same card fields
- API: `backend-cf` `suggestMealsFromPantry` tool → `meal_suggestions` card
- Locale: Traditional Chinese conversation; English card chrome

## Related Files

- `backend-cf/src/agent/tools/execute.ts` — `suggestMealsFromPantry` `cardData`
- `backend-cf/src/agent/tools/cards.ts` — `TOOL_CARD_TYPES.suggestMealsFromPantry`
- `frontend/src/components/AICookingAssistant.tsx` — meal_suggestions render expects `recipeName` / `matchScore`
- `mobile/src/components/chat/ChatMessageRow.tsx` — same field names

## Impact Scope

- Breaks trust for cook-from-pantry suggestions (core closed-loop path).
- Users may ignore or mistrust valid assistant text because the card looks broken.
- Same card-contract class of risk as resolved `chat-recipe-created-card-empty`.

## Reproducibility Notes

- Screenshot: assistant text lists 2 recipes with shortages; Meal suggestions card has empty rows and `% match`.
- Repro does not require HITL Approve (`suggestMealsFromPantry` is non-mutating).

## Related Documents

- `docs/features/kitchen-closed-loop.md`
- `docs/design/kitchen-closed-loop-design.md`
- `docs/design/backend-cf-chat-tools-design.md`
- `docs/bugs/chat-recipe-created-card-empty.md` (related class: backend field names vs flat client card shape)
