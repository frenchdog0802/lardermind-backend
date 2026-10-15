# Design: Chat meal plan → Calendar

**Feature:** [chat-meal-plan-to-calendar.md](../features/chat-meal-plan-to-calendar.md)

---

## 1. Where it fits

```
User: multi-day plan ask
  → agentLoop + COOKING_ASSISTANT_SYSTEM_PROMPT
  → text/table plan + Calendar offer (no write yet)

User: confirm / “加到行事曆”
  → looksLikeMutatingUserRequest true (extended)
  → LLM must call planMeals
  → HITL interrupt → approve → createMealPlan × N
  → done card meal_plan_updated → clients Open Calendar
```

No new client routes. Reuses existing SSE interrupt + resume + card rendering.

---

## 2. System prompt additions

Extend `COOKING_ASSISTANT_SYSTEM_PROMPT` with a short **Meal planning → Calendar** block:

1. If the user asks for a multi-day / weekly meal plan, provide a concise plan, then **ask** whether to add it to their Calendar (行事曆), unless they already asked to schedule it.
2. If they confirm or explicitly ask to add/schedule to Calendar / 行事曆 / 菜單, call **`planMeals`** with concrete `serving_date` (YYYY-MM-DD), `meal_type`, and `meal_name` (and `recipe_id` when known). Do not invent that it was saved without a tool call.
3. If the start date is unclear, ask one question or use **today (UTC date from tool context is not available)** — prefer asking once; if the user said “從明天起一週”, derive dates in the tool args.
4. Prefer `planMeals` for ≥2 slots; use `addRecipeToMenu` for a single slot.

Keep existing rules about never claiming writes without tools.

---

## 3. Tool: `planMeals`

### Schema (OpenAI function)

```ts
{
  name: 'planMeals',
  description:
    'Schedule multiple meals on the user calendar/meal plan (requires approval). Prefer this over repeated addRecipeToMenu for multi-day plans.',
  parameters: {
    type: 'object',
    properties: {
      meals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            meal_name: { type: 'string' },
            meal_type: {
              type: 'string',
              enum: ['breakfast', 'lunch', 'dinner', 'snack'],
            },
            serving_date: { type: 'string', description: 'YYYY-MM-DD' },
            recipe_id: { type: 'string' },
          },
          required: ['meal_name', 'meal_type', 'serving_date'],
        },
      },
    },
    required: ['meals'],
  },
}
```

### Limits

- Max **28** meals per call (≈ 7 days × 4 slots). If the model sends more, truncate and report in tool JSON `truncated: true`.

### Executor

For each meal (same validation as `addRecipeToMenu`):

1. Resolve `meal_name` (from arg; if empty and `recipe_id`, load recipe name).
2. `createMealPlan(db, userId, { meal_type, serving_date, recipe_id?, meal_name })`.
3. Collect successes / per-item errors.

Return:

```json
{
  "created": [ /* MealPlanDto */ ],
  "errors": [ { "index": 0, "error": "..." } ],
  "truncated": false
}
```

Card:

- `cardType`: `meal_plan_updated`
- `cardData`: `{ mealsScheduled: created.length, meals: created.map(... existing client shape) }`

### HITL

- Add `planMeals` to `MUTATING_TOOLS`.
- `argsSummary`: e.g. `12 meals (2026-10-06…2026-10-12)` or first few names + count.

### `TOOL_CARD_TYPES`

`planMeals: 'meal_plan_updated'`

### Actions

Include in `listToolNames` / chat actions endpoint automatically via `COOKING_TOOLS`.

---

## 4. Mutating-intent extensions

In `looksLikeMutatingUserRequest`:

**ZH (examples):**

- `(加到|加入|排進|寫進).{0,12}(行事曆|日曆|菜單|calendar)`
- `(行事曆|日曆|菜單).{0,12}(加|排|寫)`
- After consultative plan, user short confirms: keep relying on model + optional patterns `^(好|可以|幫我加|加吧|要|yes)` only when **previous assistant message offered calendar** — **do not** implement history-aware heuristic in v1 (too fragile). Rely on prompt + explicit phrases; short “好” may still need the model to call the tool from context (tool_choice nudge path already exists for mutating intent — if short confirm fails intent heuristic, prompt alone must suffice).

**EN:**

- `add|schedule|put` near `calendar|meal plan|menu`

Document: short confirms like “好” depend on the model following the offer turn; if flaky in practice, follow-up task can add session-flag “calendar_offer_pending”.

---

## 5. Files to change (implementation)

| Path | Role |
|------|------|
| `backend-cf/src/agent/system-prompt.ts` | Calendar offer + planMeals guidance |
| `backend-cf/src/agent/tools/definitions.ts` | `planMeals` schema |
| `backend-cf/src/agent/tools/execute.ts` | batch create |
| `backend-cf/src/agent/tools/hitl.ts` | mutating + summary |
| `backend-cf/src/agent/tools/cards.ts` | card type map |
| `backend-cf/src/agent/tools/mutating-intent.ts` (+ test) | calendar phrases |
| Tests | execute `planMeals`, hitl, mutating-intent |

**Clients:** none required for v1 if `meal_plan_updated` already handles `mealsScheduled` / `meals`.

---

## 6. Business flow

```
┌─────────────┐     text plan      ┌──────────────┐
│ Multi-day   │ ─────────────────► │ Offer add to │
│ plan ask    │                    │ Calendar     │
└─────────────┘                    └──────┬───────┘
                                          │ user confirms
                                          ▼
                                   ┌──────────────┐
                                   │ planMeals    │
                                   │ HITL interrupt│
                                   └──────┬───────┘
                          approve         │ reject
                          ▼               ▼
                   createMealPlan×N    no writes
                          ▼
                   meal_plan_updated card
```

---

## 7. Edge cases & errors

| Case | Handling |
|------|----------|
| Empty `meals` | Tool error JSON; no interrupt worth approving |
| Invalid `meal_type` / date | Per-item error; others may still create |
| HITL reject | Existing reject path |
| Model dumps 50 meals | Truncate at 28 + `truncated: true` |
| Only `listMealPlans` | Unchanged read-only |

---

## 8. Performance & security

- Same D1 writes as N× `addRecipeToMenu`; one HITL round.
- `userId` never from model args (closed over in executor).
- No new PII surfaces.

---

## 9. Risks

| Risk | Mitigation |
|------|------------|
| Model still text-only after “好” | Prompt + later optional offer-pending flag |
| Huge HITL summary | Cap meals; compact `argsSummary` |
| Duplicate days if user re-approves | Accept duplicates in v1; optional future dedupe |

---

## 10. Non-goals

Client redesign, external calendar sync, `clearMealPlans` / week replace tool, recipe auto-create for each dish.
