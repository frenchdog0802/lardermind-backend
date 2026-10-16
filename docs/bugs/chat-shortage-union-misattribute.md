# Bug: Chat shortage answer mixes meals and misattributes ingredients

**Status:** Resolved  
**Resolved by:** Label `meals[]` with serving_date/meal_name + prompt/tool require per-meal shortage narrative before week union  
**RCA:** `docs/rca/chat-shortage-union-misattribute-rca.md`  
**Fix design:** `docs/fixes/chat-shortage-union-misattribute-fix.md`  

---

## Current Behavior

In Chat (observed session, Traditional Chinese):

1. User plans remaining dinners for the week; some days are pork-rib soups, and the calendar range may also include other dishes (e.g. 宮保雞丁).
2. After meals are on the calendar, user asks 「但我還缺甚麼食材」.
3. Assistant calls availability tooling and answers with a shortage list that:
   - Labels the section as one meal (e.g. **10/15 山藥排骨湯**), but lists ingredients that belong to a **different** dish (e.g. chicken breast, peanuts, dried chili — 宮保雞丁-style).
   - Then adds self-contradictory prose: those items “look like another dish… don’t match pork rib soup.”
   - Offers to add the **whole mixed list** to the shopping list in one go.
4. User mental model is per meal/day; the answer feels like a confusing union with wrong labels.

## Expected Behavior

1. When reporting shortages for multiple planned meals, the assistant must **itemize by date + dish** (each meal’s own shortages under that meal’s heading).
2. Ingredients for dish A must not appear under dish B’s heading.
3. A week-level buy list (union) may be offered **after** the per-meal breakdown, not as a substitute that hides which meal needs what.
4. The assistant must not “doubt” its own list in prose; system data should already be labeled so the narrative can stay consistent.

## Reproduction Steps

1. Sign in (mobile or web chat) with pantry + recipes + meal plans.
2. Ensure the calendar range has **at least two** planned meals with different recipes and shortages (e.g. 宮保雞丁 on/near today and 山藥排骨湯 / 青木瓜排骨湯 on later days).
3. Ask to plan / confirm calendar additions as needed so plans exist in D1.
4. Send: `但我還缺甚麼食材` (or equivalent “what am I still missing?”).
5. Observe whether shortages are grouped by meal/day with correct ingredient→recipe attribution, or mixed/mislabeled with self-contradictory copy.

## Environment

- Chat: mobile `AICookingAssistant` / web chat
- API: `backend-cf` (`getMealPlanAvailability` via agent tools; `GET /api/meal-plan/availability`)
- Locale: Traditional Chinese
- Observed: shortage section titled for 山藥排骨湯 listing 宮保雞丁-like ingredients

## Related Files

- `backend-cf/src/db/meal-plan.ts` — `computeWeekAvailability`, `MealAvailabilityEntry`
- `backend-cf/src/agent/tools/execute.ts` — `getMealPlanAvailability` tool payload
- `backend-cf/src/agent/tools/definitions.ts` — tool description
- `backend-cf/src/agent/system-prompt.ts` — Shortages → shopping / orchestration rules
- Clients: chat transcript only (no dedicated shortage card required for this bug)

## Impact Scope

- Users mis-buy or distrust shortage answers when multiple meals share a date range.
- Shopping offer may dump an undifferentiated union that does not match how users think about “today’s dish vs later dishes.”

## Reproducibility Notes

- Product screenshots: plan table for 10/15–10/18 soups, then shortage reply under 山藥排骨湯 with Kung-Pao-like lines plus self-doubt note.
- Exact calendar contents (whether 宮保雞丁 was also scheduled in-range) should be verified during RCA against tool output shape.

## Related Documents

- `docs/features/kitchen-closed-loop.md`
- `docs/design/web-calendar-hub-design.md` (per-meal status + `weekShortages` aggregate)
- `docs/design/backend-cf-chat-tools-design.md`
- `docs/features/chat-meal-plan-to-calendar.md`
