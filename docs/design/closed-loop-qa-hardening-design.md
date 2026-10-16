# Design: Closed-loop QA hardening

**Feature:** [closed-loop-qa-hardening.md](../features/closed-loop-qa-hardening.md)

---

## 1. Where it fits

```
L1 Prompt / tool narrative
  ├─ system-prompt contracts + golden tool JSON
  └─ (later) light prompt-eval harness

L2 Deterministic state (primary automation)
  ├─ computePantrySoftReserve / computeWeekAvailability
  ├─ confirmMealPlan / skip|delete meal plan
  ├─ addItemsToShoppingList / shopping create|merge
  └─ Vitest in backend-cf

L3 E2E (few)
  └─ Maestro: clear-fridge / slot conflict
```

**Hard rule (unchanged):** Meal plan create never mutates pantry `quantity`. Only `confirmMealPlan` (and explicit pantry tools / shopping sync) writes on-hand.

---

## 2. Architecture approach

| Layer | What we add | What we do not add in this feature |
|-------|-------------|-------------------------------------|
| Tests | Lifecycle + attribution + shopping policy fixtures | Live LLM CI flakiness as gate |
| Prompt | Explicit getPreferences-before-plan; fuzz refuse wording | New workflow engine |
| Product | Only after Phase 0 locks (#2 merge, #4 units, #5 qty0, optional #3/#1 UX) | Full meal↔shopping graph in v1 |

---

## 3. Phase designs

### Phase 0 — Decision record

Locked 2026-10-15 (user: 全用建議).

| # | Locked choice | Notes |
|---|---------------|-------|
| 1 | Allow duplicate slots + chat warn | No unique constraint; warn in system prompt |
| 2 | Server merge shopping by CI name + unit | Agent + Calendar must match |
| 3 | v1 leave shopping on cancel | No meal↔line provenance this feature |
| 4 | Clarify or refuse on unit mismatch | No silent 包↔g subtract |
| 5 | Delete pantry row when confirm → qty ≤0 | Align with chat `updatePantryItems` |
| 6 | Must `getPreferences` before planMeals / cookable | Prompt contract + Vitest |

---

### Phase 1 — Soft-reserve lifecycle Vitest

**Goal:** Prove plan → available drops → cancel/skip/delete → available restored; confirm → on_hand drops.

**Approach:**

1. Prefer extending `meal-plan-availability.test.ts` and/or `domain-crud.test.ts` with an explicit lifecycle suite (same helpers as production).
2. Fixture: one pantry row (e.g. Egg qty 6), recipe needing 3, create `PLANNED` meal → soft-reserve `available === 3` → delete/skip plan → `available === 6`.
3. Separate case: confirm → qty 3, status `CONFIRMED` (already partially covered; keep as named lifecycle test).

**Files:** `backend-cf/src/db/meal-plan*.ts`, `backend-cf/src/routes/domain-crud.test.ts` or `meal-plan-availability.test.ts`

**No product change.**

---

### Phase 2 — Multi-meal shortage attribution regression

**Goal:** Guard Resolved bug `chat-shortage-union-misattribute`.

**Approach:**

1. Two planned meals, distinct recipes, short pantry → `computeWeekAvailability` / HTTP availability: each `meals[]` entry has correct `serving_date`, `meal_name`, and meal-local `shortages` (A’s ings not required under B).
2. Assert `buildCookingAssistantSystemPrompt` still requires per-meal narrative before week union.
3. Optional: freeze a golden tool-result JSON + expected heading order for manual / future eval (store under `backend-cf/src/agent/fixtures/` if added).

**No product change unless tests fail against shipped code.**

---

### Phase 3 — Shopping duplicate policy

**Depends on:** Decision #2.

| If lock = merge | If lock = keep insert |
|-----------------|------------------------|
| Change `addItemsToShoppingList` execute (+ ideally REST create) to merge qty by CI name+unit | Document + Vitest that two adds → two rows; Calendar skip remains client-only |

Calendar `addShortagesToShopping` should match agent policy after lock.

---

### Phase 4 — Cancel → shopping

**Depends on:** Decision #3.

| v1 leave | v2 provenance |
|----------|---------------|
| Doc + test: cancel does not delete shopping rows | Schema/tag `source_meal_plan_id`; rollback on cancel only tagged unchecked lines; keep shared ings used by other plans |

**v1 recommended for this feature’s first ship.**

---

### Phase 5 — Prompt contracts (allergy + fuzz)

**Depends on:** Decision #6 for allergy mandate.

1. System prompt: before `planMeals` / cookable suggest, call `getPreferences` when allergies/diet matter; honor allergies.
2. Fuzz: refuse non-food pantry adds (e.g. iPhone); empty pantry honesty; `planMeals` max 28 already in tool — prompt should not promise 100-day schedule without truncate disclosure.
3. Vitest string/contract tests on prompt builder; optional mutating-intent / execute refuse for non-food if we add a light server guard.

---

### Phase 6 — Unit mismatch

**Depends on:** Decision #4.

Minimal path:

1. When allocating/confirming, if matched ingredient has **different unit** (normalized string) and both quantities present → do not subtract; return `unit_mismatch` shortage / tool error asking grams-per-pack or unit align.
2. Chat: prompt to ask clarification instead of inventing conversion.
3. Vitest: 包 vs g does not silently deduct.

Defer full UnitConverter tables.

---

### Phase 7 — Maestro E2E

1. Clear-fridge: seed pantry → chat suggest + plan (HITL approve if automatable) → calendar shows meal; no shopping required if cookable.
2. Same-slot: manual dinner then chat second dinner → assert warn and/or two rows per decision #1.

Scope mobile Maestro under `mobile/.maestro/`; web manual script acceptable if Maestro chat HITL is blocked.

---

## 4. Data / API impact

| Phase | Schema | API |
|-------|--------|-----|
| 1–2 | None | None |
| 3 merge | None (query existing rows) | Behavior change on create |
| 4 v2 | Optional column / JSON on shopping_list_items | Cancel hook |
| 5 | None | Prompt only (± guard) |
| 6 | None | Availability/confirm shortage shape may add reason |
| 7 | None | None |

---

## 5. Risks

| Risk | Mitigation |
|------|------------|
| LLM golden flaky | Gate on tool JSON + prompt strings; eval optional |
| Merge changes shopping UX | Feature flag or explicit Phase 3 task + Calendar parity |
| Unit refuse breaks old recipes | Match only when both units non-empty and unequal |

---

## 6. Rollback

| Phase | Rollback |
|-------|----------|
| Tests only | Delete/revert test files |
| Prompt | Revert `system-prompt.ts` |
| Shopping merge | Revert execute to INSERT-only |
| Unit mismatch | Revert match branch; silent subtract returns |

---

## 7. Test plan summary

| Phase | Primary command |
|-------|-----------------|
| 1–6 | `npm test` in `backend-cf` (filtered) |
| 7 | `mobile/scripts/run-e2e.js` + specific Maestro yaml |
