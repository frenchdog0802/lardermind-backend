# Feature: Web Calendar Hub (Phase 1)

**Status:** Implemented  
**Scope:** Web Calendar UX + backend-cf read-only meal availability; week view as primary, thumbnails, inventory traffic lights, one-click shortages → shopping list; fix confirm toast visibility  
**Out of scope:** Drag-and-drop reschedule; prep-ahead reminders; mobile parity; Google/Apple calendar sync; auto-deduct pantry on schedule; Chat `planMeals` (separate feature)

**Design:** [web-calendar-hub-design.md](../design/web-calendar-hub-design.md)  
**Tasks:** [tasks/web-calendar-hub/](../../tasks/web-calendar-hub/)

---

## 1. Summary

LarderMind Calendar should make “what we eat this week” and “what we still need to buy” obvious on **web**. Today the week list exists but lacks recipe thumbnails and pantry readiness; confirm shortages only toast toward Pantry (and the toast is often invisible because it is nested under the add-recipe modal).

This feature:

1. Exposes a **read-only** availability API that week-allocates pantry across planned meals.
2. Makes **week (list) view** the default on web Calendar with thumbs + green/red/unknown lights.
3. Lets users **add shortages to the shopping list** in one click (per meal or whole week).
4. Hoists Calendar toasts so confirm/skip feedback always shows.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature name | **`web-calendar-hub`** | Web-first hub; mobile later |
| Pantry on schedule | **Never deduct** on preview/schedule | Only `confirm` mutates pantry |
| Lights | Week-aware virtual allocation | Avoid false greens when two meals share one ingredient |
| Free-text meals (no `recipe_id`) | Light = **unknown** | Cannot compute shortages |
| Shopping writes | Sequential `POST /api/shopping-list` | Matches existing client + agent pattern |
| Default view | Week **list** | Matches “see the week” expectation |
| Amber light | Fold into **short** (red) for v1 | Keep three states: ok / short / unknown |

---

## 2. Current system

### 2.1 Backend

- `meal_plans` CRUD + `confirm` / `skip` / `pending-confirm`.
- `confirmMealPlan` compares recipe ingredients vs pantry, deducts, returns `shortages`.
- No preview/availability endpoint.

### 2.2 Web

- [`frontend/src/components/Calendar.tsx`](../../frontend/src/components/Calendar.tsx): month + week list, day panel, add/confirm/skip/delete.
- Toast for shortages/confirm is rendered **inside** the add-recipe modal only.
- Shopping: single-item create via `shoppingListApi`.

---

## 3. Requirements

### 3.1 Availability API

- `GET /api/meal-plan/availability?from=YYYY-MM-DD&to=YYYY-MM-DD`
- Auth required; user-scoped.
- Returns per-meal status + shortages and week-aggregated shortages.
- Read-only (no pantry writes).

### 3.2 Web Calendar

1. Default to week list view; keep month toggle.
2. Week rows: thumbnail (meal/recipe image), name, meal type, status, traffic light.
3. When short: show shortage summary + **Add missing to shopping**.
4. Week header: if `weekShortages.length > 0`, **Add all missing** CTA.
5. After confirm with remaining shortages: toast with **Add to shopping** action.
6. Toast UI always mounted (not only when add modal open).
7. Warm Kitchen tokens only; i18n keys under `calendar.*`.

### 3.3 Confirm behavior

- Unchanged deduct semantics; reuse shared shortage comparison where possible.

---

## 4. Edge cases

| Case | Expected |
|------|----------|
| No `recipe_id` | `unknown`; no shortages list |
| Recipe missing / deleted | Treat as `unknown` or empty ok with no ingredients |
| Meal already `CONFIRMED` / `SKIPPED` | Omit from week allocation pool (or status not lit as actionable short) |
| Empty date range / bad dates | 400 |
| Duplicate shopping names | Best-effort skip if unchecked item already exists (name CI + unit) |
| Partial create failures | Report how many added; do not claim all succeeded |

---

## 5. Success criteria

- [x] Week view shows thumbs + ok/short/unknown lights for meals in range
- [x] Red meal / week CTA adds shortages to shopping without leaving Calendar
- [x] Confirm still deducts; availability never mutates pantry
- [x] Shortage toast visible after confirm when add modal is closed
- [x] Vitest covers shortage compute + availability aggregation
- [x] Feature docs + tasks marked done; mobile unchanged

---

## 6. References

- Plan: Web Calendar Hub Phase 1  
- Related: [backend-cf-domain-crud-design.md](../design/backend-cf-domain-crud-design.md), [chat-meal-plan-to-calendar.md](./chat-meal-plan-to-calendar.md)
