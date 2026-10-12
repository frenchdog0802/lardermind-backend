# Bug: Chat uses wrong “today” for meal plans and invents prior tool failure

**Status:** Resolved  
**Resolved by:** Dated system prompt + `clientLocalDate` from web/mobile chat requests  
**RCA:** `docs/rca/chat-wrong-today-date-rca.md`  
**Fix design:** `docs/fixes/chat-wrong-today-date-fix.md`  

---

## Current Behavior

In Chat (observed session):

1. User asks to add a recipe to **today’s** meal plan (e.g. 「幫我新增 麻油雞到今天的規劃中」).
2. The assistant treats “today” as **`2025-06-05`**, schedules `addRecipeToMenu` for that date, and confirms success for that date.
3. Opening **Calendar** for the user’s real current day does **not** show the dish.
4. In the same thread, a shopping-list add for 「蒜頭」 already produced a success card (`Added 1 items to your shopping list` / 蒜頭), but a later assistant message claims the previous turn **did not call tools** and that garlic (and 宮保雞丁) **may not have been added**.

## Expected Behavior

1. When the user says 「今天」 / “today”, meal-plan tools must use the user’s **actual local calendar date** (`YYYY-MM-DD`).
2. After Approve, Calendar for that local today must show the scheduled meal.
3. The assistant must **not** claim a prior tool write failed when the thread already shows a successful tool/card result for that write; at minimum it must not invent “tools were not called” when a success card is present.

## Reproduction Steps

1. Sign in (web or mobile) against chat tools + HITL.
2. Optionally add an item to the shopping list via chat and Approve; confirm the shopping-list success card appears.
3. Send: `幫我新增 麻油雞到今天的規劃中` (or equivalent with an existing recipe name).
4. Complete any meal-type / Approve steps the assistant requests.
5. Observe the date the assistant uses for “今天” (e.g. `2025-06-05` while the real local date is not that day).
6. Open Calendar for the real local today → dish missing.
7. Optionally open Calendar for the hallucinated date → dish may appear there.
8. Observe later assistant text claiming a prior successful shopping-list add might have failed.

## Environment

- Chat: web `AICookingAssistant` and/or mobile chat
- Calendar / meal plans UI
- API: `backend-cf` (`POST /api/chat/stream`, `/send`, `/resume`)
- Locale: Traditional Chinese user messages
- Observed wrong date in UI: `2025-06-05`

## Related Files

- `backend-cf/src/agent/system-prompt.ts` — static prompt; no current date
- `backend-cf/src/agent/agent-loop.ts` — builds LLM messages with system prompt
- `backend-cf/src/agent/tools/definitions.ts` / `execute.ts` — `addRecipeToMenu` `serving_date`
- `frontend/src/api/chat.ts` / `mobile/src/api/chat.ts` — chat request body
- Clients: chat UI showing HITL + shopping-list / meal-plan cards

## Impact Scope

- Meal plans land on wrong days; Calendar looks empty for “today”.
- Users lose trust when the model contradicts visible success cards.
- Same wrong-date risk for any “今天 / tomorrow / this week” scheduling language.

## Reproducibility Notes

- Screenshot pair from product chat: shopping-list success card + assistant disclaimer that tools may not have run; meal scheduled for `2025-06-05`.
- Wrong date appears both in assistant prose and in HITL summary (`addRecipeToMenu — … on 2025-06-05`).

## Related Documents

- `docs/bugs/chat-pantry-add-claimed-but-empty.md` (related: invented write status without tool truth)
- `docs/features/backend-cf-chat-tools.md`
- `docs/features/chat-meal-plan-to-calendar.md` (planned multi-day calendar path; single-slot uses `addRecipeToMenu` today)
