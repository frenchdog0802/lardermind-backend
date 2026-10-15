# Design: Kitchen closed loop (epic)

**Feature:** [kitchen-closed-loop.md](../features/kitchen-closed-loop.md)

---

## 1. Where it fits

```
Chat (tools + HITL)
  ├─ Pantry CRUD (Phase 1+)     → D1 pantry_items
  ├─ listPantry (+ available)   → on_hand / available (Phase 2)
  ├─ planMeals / addRecipeToMenu → meal_plans (soft reserve only)
  ├─ suggestMealsFromPantry     → cookable under reserve (Phase 4)
  └─ shopping tools             → shortages offer (Phase 3)

Calendar UI
  └─ GET availability (existing) → virtual soft-reserve lights

Confirm meal
  └─ confirmMealPlan            → real pantry deduct (unchanged contract)

Shopping
  └─ batch sync to pantry       → existing / sibling feature
```

**Hard rule:** Creating or editing a meal plan **never** calls `updatePantryItem` / `deletePantryItem`. Only `confirmMealPlan` (and shopping sync / explicit pantry tools) mutate pantry quantities.

---

## 2. Soft-reserve model (locked)

### Definitions

| Term | Meaning |
|------|---------|
| `on_hand` | Stored `pantry_items.quantity` |
| Soft reserve | Virtual allocation of `on_hand` across open plans (`PLANNED`, `PENDING_CONFIRM`) in stable order |
| `available` | Remaining pool after allocating earlier meals in the window (or “rest of open plans” — see Phase 2) |
| Real deduct | `confirmMealPlan` writes reduced `on_hand` |

### Why virtual (v1)

- Cancel/delete/skip plan automatically releases reserve (no compensating writes).
- Matches [web-calendar-hub](../features/web-calendar-hub.md) week allocation.
- Avoids dual-write bugs between `meal_plans` and pantry rows.

### Persist `reserved_qty` later?

Only if we need cross-request holds without re-reading meal plans, or offline clients. **Not in epic v1.**

---

## 3. Phase designs

### Phase 1 — Chat pantry adjust & remove

#### Tools

Prefer two clear tools (HITL, mutating):

| Tool | Behavior |
|------|----------|
| `updatePantryItems` | Match by `id` or name (CI); set or **delta** quantity; unit optional |
| `removePantryItems` | Match by `id` or name; delete row(s) |

**Quantity rules:**

- Support `mode: 'set' | 'delta'` on update (delta negative = reduce).
- After update, if `quantity <= 0` → **delete** row (same as explicit remove).
- Do **not** allow `addPantryItems` with negative qty.

**Matching:** Reuse pantry find helpers (`findByNameCi` / id). Ambiguous multi-match → tool error asking user to disambiguate (or require id).

**HITL / cards:**

- Add both to `MUTATING_TOOLS`.
- `argsSummary`: names + qty change.
- Card: reuse `pantry_updated` (same as add).

**Prompt:**

- State that adjust/remove tools exist.
- Forbid claiming delete without calling them.
- Forbid inventing “use negative add”.

**Execute:** Call existing `updatePantryItem` / `deletePantryItem` in `db/pantry.ts`.

**Tests:** Vitest execute + HITL + agent-loop interrupt/approve path (mirror `addPantryItems`).

#### Files (expected)

| Path | Change |
|------|--------|
| `backend-cf/src/agent/tools/definitions.ts` | New tool schemas |
| `backend-cf/src/agent/tools/execute.ts` | Cases |
| `backend-cf/src/agent/tools/hitl.ts` | Mutating set + summary |
| `backend-cf/src/agent/tools/cards.ts` | Card map |
| `backend-cf/src/agent/system-prompt.ts` | CRUD + no negative-add |
| `backend-cf/README.md` | Tool list |
| `backend-cf/src/agent/**/*.test.ts` | Coverage |

---

### Phase 2 — Soft-reserve product contract

#### Semantics to publish

1. Scheduling a meal **reserves** (virtually) recipe ingredients for that meal’s date/order.
2. `available` for cooking/suggestions = pool after allocating other open plans (define window: default **all open plans from today forward**, or calendar query range — **lock in Phase 2 task** to match availability API).
3. Confirm **deducts** `on_hand`; skipped/deleted plans do not.

#### API / agent surface (minimal)

| Option | Choice for Phase 2 |
|--------|---------------------|
| New columns | None |
| `listPantry` enrichment | Optional: `{ on_hand, available, unit, name, id }` when a `from`/`to` or “open plans” context is computed |
| Chat prompt | Explicit reserve vs confirm wording |
| Docs | Update calendar hub + domain CRUD cross-links |

Reuse `computeWeekAvailability` / pool helpers from `db/meal-plan.ts` rather than a third allocator.

#### Risks

- `listPantry` without date context cannot know “this week’s” available — either always compute open-forward plans, or keep list as on_hand and teach the model to call availability. **Prefer:** Phase 2 task decides one default (recommend open-forward allocation in a dedicated read tool or listPantry flag).

---

### Phase 3 — Plan ↔ shortage ↔ shopping

#### Flow

```
planMeals / schedule
  → (optional) compute shortages vs soft-reserve pool
  → interrupt/card or follow-up text: offer addItemsToShoppingList for deficits
  → user approve shopping writes
```

Calendar UI already has “Add missing”; Phase 3 focuses on **chat parity** and any missing glue after `planMeals`.

Do not auto-add shopping lines inside `planMeals` execute without a separate mutating tool / HITL batch (keep shopping intentional).

---

### Phase 4 — Cookable under reserve

#### Logic

1. Build virtual pool from `on_hand`.
2. Optionally pre-allocate existing open plans (exclude the meal being scored if re-planning).
3. Score / filter recipes whose ingredients fit remaining pool (same match order as confirm).

Wire into `suggestMealsFromPantry` first; plan helpers second.

---

### Phase 5 — Chat orchestration

#### Bounded sequence (prompt + tools, not a new workflow engine)

1. `listPantry` / availability-aware read  
2. `listMyRecipes` / `suggestMealsFromPantry`  
3. Offer schedule → `planMeals` (HITL)  
4. Report soft reserves + shortages  
5. Offer `addItemsToShoppingList` for deficits (HITL)  
6. Remind: real deduct happens on Calendar **confirm** when cooked  

Max agent rounds unchanged (`CHAT_RECURSION_LIMIT`). No LangGraph.

Variety: if too few matching recipes, say so and offer `createRecipe` — do not silently loop two dishes without disclosure.

---

## 4. Edge cases & errors

| Case | Handling |
|------|----------|
| Update unknown name | Tool result error; model asks user |
| Concurrent confirm + chat remove | Last writer wins on row; acceptable v1 |
| confirm after chat wiped ingredient | Existing shortage path |
| Unit mismatch (包 vs g) | No silent convert in Phase 1; match row unit or error |

---

## 5. Security & performance

- HITL for all chat pantry writes.
- User id only from auth context.
- Soft-reserve reads: one pantry load + meals in range; cache nothing cross-request in v1.

---

## 6. Rollback

| Phase | Rollback |
|-------|----------|
| 1 | Remove new tools from definitions; redeploy Worker — pantry API CRUD unchanged |
| 2 | Prompt/API field revert; no schema |
| 3–5 | Disable prompt paths / tools; calendar confirm untouched |

---

## 7. Implementation order

Follow [tasks/kitchen-closed-loop/](../../tasks/kitchen-closed-loop/). **Do not start Phase N+1 coding until Phase N checklist is done** (unless user explicitly reprioritizes).
