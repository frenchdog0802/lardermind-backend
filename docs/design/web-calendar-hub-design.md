# Design: Web Calendar Hub (Phase 1)

**Feature:** [web-calendar-hub.md](../features/web-calendar-hub.md)

---

## 1. Where it fits

```
Web Calendar (week list)
  → GET /api/meal-plan/availability?from&to
  → computeWeekAvailability (virtual pantry pool)
  → lights + weekShortages

User: Add missing → POST /api/shopping-list × N (dedupe client-side)

User: Confirm meal
  → confirmMealPlan (shared compare + deduct)
  → toast + optional Add to shopping
```

No schema migration. Mobile unchanged.

---

## 2. Shared shortage engine

Extract from `confirmMealPlan` in `backend-cf/src/db/meal-plan.ts`:

### Types

```ts
type MealConfirmShortage = {
  ingredient_id?: string;
  name: string;
  needed: number;
  available: number;
  unit: string;
};

type MealAvailabilityStatus = 'ok' | 'short' | 'unknown';
```

### `computeMealShortagesAgainstPool`

Inputs: recipe ingredients + mutable virtual pantry map (key by `ingredient_id` or lowercased name).

For each ingredient:

1. Resolve pantry entry from the pool (same match order as confirm: id then name CI).
2. If missing → shortage with `available: 0`; do not allocate.
3. Else allocate `min(available, needed)`; reduce pool; if shortfall, push shortage with pre-allocation `available`.

Returns `{ status, shortages }` where:

- no `recipe_id` or recipe not found → `{ status: 'unknown', shortages: [] }`
- else if shortages.length → `short`
- else `ok`

### `confirmMealPlan`

Keep writing to real pantry (same loop as today), or: run against real rows with writes. Prefer minimal change: keep confirm’s deduct loop but share `findPantryForIngredient` / quantity helpers. Availability uses a **copy** of quantities in memory only.

### `computeWeekAvailability(db, userId, from, to)`

1. List user’s meal plans with `serving_date` in `[from, to]` inclusive, ordered by `serving_date`, `created_at`.
2. Load pantry once into a mutable map of remaining qty.
3. For each meal with status in `PLANNED` | `PENDING_CONFIRM`:
   - If no recipe_id → meal result `unknown`, do not touch pool.
   - Else load ingredients; allocate via pool; record meal result.
4. Meals with `CONFIRMED` / `SKIPPED`: return `ok` with empty shortages (or omit lights); **do not** allocate (already cooked or cancelled).
5. Aggregate `weekShortages`: sum remaining shortfalls by key (`ingredient_id` or lower name) + unit; `needed` = sum of shortfall amounts (`needed - available` per meal shortage entry), `available` = 0 for buy list clarity (or first-seen available — prefer **deficit** as `needed` and `available: 0` for shopping).

**Shopping-oriented weekShortages shape:** same `MealConfirmShortage` fields where `needed` = total deficit to buy, `available` = 0.

---

## 3. API

### `GET /api/meal-plan/availability`

Query: `from`, `to` (required, `YYYY-MM-DD`). Invalid/missing → 400.

Register **before** `/api/meal-plan/:id`.

Response `data`:

```ts
{
  meals: Array<{
    meal_plan_id: string;
    status: 'ok' | 'short' | 'unknown';
    shortages: MealConfirmShortage[];
  }>;
  weekShortages: MealConfirmShortage[];
}
```

Auth: `requireAuth`. No writes.

---

## 4. Web Calendar UX

File: `frontend/src/components/Calendar.tsx` (+ `api/mealPlan.ts`, `api/types.ts`, i18n).

| Change | Detail |
|--------|--------|
| Default view | `viewMode = 'list'` |
| Fetch | On mount / week nav / after create·confirm·skip·delete → `mealPlanApi.availability(from, to)` |
| Thumb | `<img>` from `item.image` or recipe `image.url`; placeholder if none |
| Light | Dot/badge: herb = ok, terracotta/danger = short, muted = unknown |
| Meal CTA | If short: list up to 3 shortages + “Add missing to shopping” |
| Week CTA | If `weekShortages.length`: button in week header |
| Toast | Hoist outside add modal; shortage toast includes action button |
| Dedupe | Before create, skip if shopping list has unchecked item with same name CI + unit |

Preserve Warm Kitchen classes; no new card types.

---

## 5. Files to change

| Path | Role |
|------|------|
| `backend-cf/src/db/meal-plan.ts` | Extract helpers; `computeWeekAvailability` |
| `backend-cf/src/routes/meal-plan.ts` | GET availability |
| `backend-cf/src/routes/domain-crud.test.ts` or new `meal-plan-availability.test.ts` | Vitest |
| `frontend/src/api/types.ts` | Availability types |
| `frontend/src/api/mealPlan.ts` | `availability()` |
| `frontend/src/components/Calendar.tsx` | UX |
| `frontend/src/i18n/locales/en.json` (+ zh if present) | Copy |
| `frontend/src/contexts/pantryContext.tsx` | Only if shopping list fetch helper needed |

---

## 6. Edge cases & errors

| Case | Handling |
|------|----------|
| `from` > `to` | 400 |
| Empty range results | `{ meals: [], weekShortages: [] }` |
| Recipe with zero ingredients | `ok` |
| Concurrent pantry edits | Best-effort snapshot; refresh after mutations |

---

## 7. Performance & security

- One pantry list + N recipe ingredient loads per request; acceptable for ≤28 meals/week.
- `userId` from auth only.
- Preview never writes pantry.

---

## 8. Risks

| Risk | Mitigation |
|------|------------|
| Unit mismatch across recipes | Same as confirm (no conversion) |
| Toast action stale shortages | Refetch availability after shopping adds |
| Large Calendar.tsx | Prefer localized edits; extract helpers only if needed |

---

## 9. Non-goals

Drag-drop, prep reminders, bulk shopping API, mobile UI, Chat tools.
