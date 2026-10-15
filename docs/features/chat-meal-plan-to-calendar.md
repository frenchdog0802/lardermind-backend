# Feature: Chat meal plan → Calendar

**Status:** Implemented (via [kitchen-closed-loop](./kitchen-closed-loop.md) Phase 5 — `planMeals` + prompt + mutating-intent)  
**Scope:** Backend (`backend-cf/` agent: system prompt, tools, mutating-intent) so multi-day meal planning can be written to the user’s Calendar via HITL; existing web/mobile `meal_plan_updated` cards  
**Out of scope:** Google/Apple calendar export; wipe-and-replace an entire week without HITL; auto-creating a recipe row for every suggested dish; new dedicated UI button (v1 uses text CTA + existing Approve banner + Open Calendar card); Stripe / quota changes

**Design:** [chat-meal-plan-to-calendar-design.md](../design/chat-meal-plan-to-calendar-design.md)  
**Tasks:** [tasks/chat-meal-plan-to-calendar/](../../tasks/chat-meal-plan-to-calendar/)

---

## 1. Summary

Users often ask the cooking assistant to **plan several days of meals** (e.g. 「幫我規劃一週月子餐」). Today the model usually replies with a Markdown table only. Nothing is written to `meal_plans`, so the Calendar stays empty and clients never show the **Open Calendar** card.

This feature makes multi-day planning a first-class path into **LarderMind Calendar**:

1. After proposing a multi-day schedule, the assistant **offers** to add it to the user’s Calendar.
2. When the user agrees (or explicitly asks to add), the agent **must call a mutating meal-plan tool** (HITL approve/reject), not only describe the change.
3. On approve, entries land in D1 `meal_plans` and the response uses the existing `meal_plan_updated` card.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature name | **`chat-meal-plan-to-calendar`** | Cross-client; owned by chat agent + meal-plan writes |
| Default after multi-day proposal | **Offer** (“要幫你加到 Calendar 嗎？”) before writing | Avoid surprising HITL on a consultative ask like 「規劃」 |
| Explicit write phrases | Treat as mutate intent → **must call tool** | e.g. 加到行事曆 / add to calendar / 排進菜單 |
| Bulk write | New mutating tool **`planMeals`** (array of meals) | One HITL batch vs N× `addRecipeToMenu`; Nest had `planMeals` |
| Keep `addRecipeToMenu` | Yes, for single-slot schedules | No regression |
| Dates | `serving_date` **YYYY-MM-DD**; if start day unclear, ask once or default to **today’s local calendar week starting today** | Tool executor stays timezone-naive strings; prompt asks when ambiguous |
| Recipes | `recipe_id` optional; free-text `meal_name` allowed | Matches current `createMealPlan` |
| HITL | Same as other mutating tools | Existing Approve/Reject UI |
| Clients | **No new card type** in v1 | Reuse `meal_plan_updated` + Open Calendar |
| Quota | Unchanged (charge on stream/send only) | Resume still free |

---

## 2. Current system

### 2.1 Backend

- Tools: `listMealPlans`, `addRecipeToMenu` → `createMealPlan` (single row).
- System prompt mentions meal plans but does **not** require offering Calendar write after multi-day plans.
- `looksLikeMutatingUserRequest` matches 新增/加入…菜單 etc., but **not** 「規劃一週…」 alone.

### 2.2 Clients

- Web/mobile already render `meal_plan_updated` with **Open Calendar**.
- HITL interrupt UI already supports multi-tool summaries.

---

## 3. Requirements

### 3.1 Assistant behavior

1. When the user asks for a **multi-day** meal plan (≥2 days or “一週/week”), the assistant may still give a concise plan in text/table.
2. That same turn (or immediately after the plan) **must** include a clear offer to add the plan to **Calendar / 行事曆**, and what info is still needed (start date if missing).
3. When the user confirms or uses an explicit write phrase, the assistant **must** call `planMeals` (or `addRecipeToMenu` for a single slot) — never claim the Calendar was updated without a tool call.

### 3.2 `planMeals` tool

- Mutating; HITL gated.
- Args: list of `{ meal_name, meal_type, serving_date, recipe_id? }`.
- Executor: create one meal plan row per item (best-effort; report successes/failures in tool result).
- Card: `meal_plan_updated` with `mealsScheduled` + `meals` summary (match client fields).

### 3.3 Mutating-intent heuristic

- Extend ZH/EN patterns for calendar / 行事曆 / 加到這週菜單 / planMeals-style confirms after a plan was offered.
- 「規劃」 alone remains consultative (offer only); 「加到行事曆」 forces tool.

### 3.4 Actions list

- `GET /api/chat/actions` includes `planMeals`.

---

## 4. Edge cases

| Case | Expected |
|------|----------|
| User only wants ideas, never confirms | No meal_plan writes |
| User confirms without dates | Ask one focused question **or** use agreed default start date before tool call |
| Partial tool failures | Tool result lists created vs failed; assistant text must not claim all succeeded |
| User rejects HITL | No rows written; text acknowledges reject |
| Mix with other mutating tools in one batch | Existing HITL batch rules apply |
| > recursion / too many meals | Cap meals per `planMeals` call (design locks number); ask user to split weeks if needed |

---

## 5. Success criteria

- [ ] Multi-day plan replies include a Calendar offer
- [ ] Explicit “add to calendar” → `planMeals` (or interrupt with it), not text-only “already added”
- [ ] Approve writes D1 meal plans; Open Calendar card appears
- [ ] Reject writes nothing
- [ ] Vitest for `planMeals` execute + mutating classification + prompt/intent coverage as designed
- [ ] Feature docs + tasks marked done

---

## 6. References

- Related: [backend-cf-chat-tools.md](./backend-cf-chat-tools.md), Nest `planMeals` in [chat-langgraph-design.md](../designs/chat-langgraph-design.md)
- Bug context (timestamp separate): [chat-message-timestamp-visible.md](../bugs/chat-message-timestamp-visible.md)
