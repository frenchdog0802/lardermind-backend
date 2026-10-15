# Feature: Kitchen closed loop (epic)

**Status:** Implemented (phased 1–5 in `backend-cf` agent + soft-reserve helpers)  
**Scope:** Product contract + phased delivery so Pantry → Recipes → Calendar → Shopping → Chat behave as one loop under **soft reserve on schedule / real deduct on cook confirm**  
**Out of scope (epic-wide):** Google/Apple calendar sync; Stripe; mobile visual redesign; LangGraph port; “schedule writes pantry quantity” (hard deduct on plan); replacing shopping batch-sync UX wholesale; Inventory UI labels for available (API/tool only in this epic)

**Design:** [kitchen-closed-loop-design.md](../design/kitchen-closed-loop-design.md)  
**Tasks:** [tasks/kitchen-closed-loop/](../../tasks/kitchen-closed-loop/)

**Related (do not duplicate):**

| Feature | Role in the loop |
|---------|------------------|
| [web-calendar-hub](./web-calendar-hub.md) | Week availability lights + shortages → shopping (Phase 1 of calendar) |
| [chat-meal-plan-to-calendar](./chat-meal-plan-to-calendar.md) | Chat `planMeals` → Calendar HITL (implemented under this epic) |
| [shopping-pantry-batch-sync](./shopping-pantry-batch-sync.md) | Checked shopping → explicit batch into pantry |
| [backend-cf-chat-tools](./backend-cf-chat-tools.md) | Existing tool + HITL baseline |

---

## 1. Summary

LarderMind’s five hubs (Chat, Calendar, Pantry, Shopping, Recipes) must feel like one closed system:

**Pantry supplies ingredients → Recipes define consumption → Calendar soft-reserves stock → Confirm cooks and deducts → Shopping fills gaps → Chat orchestrates.**

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature / epic name | **`kitchen-closed-loop`** | Cross-hub product contract, not a single screen |
| Deduct timing | **Confirm (cook) only** mutates pantry `quantity` | Matches existing `confirmMealPlan` |
| Schedule semantics | **Soft reserve** — planned meals reduce **available** (virtual allocation) | 排入＝預留、煮完才真扣 |
| Soft reserve storage (v1) | **Virtual** via allocation engine — no `reserved_qty` column | Reuse availability math |
| Cancel / delete / skip plan | Releases soft reserve automatically | No pantry write on cancel |
| Chat pantry writes | Full adjust + remove (HITL) | End “我沒有刪除工具” |
| Negative merge-add | **Forbidden** as a substitute for remove/adjust | Explicit tools only |

---

## 2. Phases (shipped)

| Phase | Name | Status |
|-------|------|--------|
| **1** | Chat pantry adjust / remove | Done |
| **2** | Soft-reserve contract (`listPantry` on_hand/reserved/available) | Done |
| **3** | Plan → shortage → shopping (`getMealPlanAvailability` + shoppingHints + prompt) | Done |
| **4** | Cookable recipes (`suggestMealsFromPantry` prefers available/cookable) | Done |
| **5** | Chat orchestration (prompt playbook + `planMeals` + availability + shop offer) | Done |

---

## 3. Success criteria

### Phase 1

- [x] `updatePantryItems` / `removePantryItems` tools + HITL + Vitest
- [x] System prompt: never claim missing delete tools; no negative add
- [x] Mutating-intent: 「刪除 10 包排骨」「排骨減 3 包」
- [x] README tool list updated

### Phase 2

- [x] Soft-reserve helpers + `listPantry` returns on_hand / reserved / available
- [x] Prompt prefers **available** when planning

### Phase 3

- [x] `getMealPlanAvailability` read tool + `shoppingHints` from week shortages
- [x] Prompt: after plan, offer `addItemsToShoppingList` when short

### Phase 4

- [x] `suggestMealsFromPantry` cookable-aware scoring against available stock

### Phase 5

- [x] `planMeals` mutating tool (HITL, max 28, soft-reserve note)
- [x] Prompt orchestration steps for multi-day planning
- [x] Calendar mutating-intent phrases

---

## 4. Edge cases (epic)

| Case | Expected |
|------|----------|
| Plan then cancel | Soft reserve released; on-hand unchanged |
| Confirm with partial stock | Deduct what exists; return shortages |
| Two meals share one ingredient | Soft reserve week-allocates in date order |
| Free-text meal (no recipe_id) | Unknown reserve; no auto shortages |
| Adjust below soft-reserved need | Allowed (on-hand write); available recomputed next read |

---

## 5. Non-goals (still out)

- Hard-deduct pantry on `createMealPlan` / `planMeals`
- Persisted `reserved_qty` column
- Web Inventory UI showing available badges (follow-up)
- Auto-creating many recipes for menu variety

---

## 6. References

- Design: [kitchen-closed-loop-design.md](../design/kitchen-closed-loop-design.md)
- Tasks: [tasks/kitchen-closed-loop/](../../tasks/kitchen-closed-loop/)
