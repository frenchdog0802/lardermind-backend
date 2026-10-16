# Task 70: Manual / Maestro E2E checklist

**Depends on:** Phases 1–6  
**Repo:** `mobile/.maestro/` (existing smoke only) + this checklist

## Goal

Cover clear-fridge and same-slot conflict without blocking on flaky live-LLM Maestro chat HITL.

## Automated (existing)

- `mobile/.maestro/smoke.yaml`, `shopping-add.yaml`, `recipe-add.yaml`, `bottom-nav-last-tab.yaml`

## Manual closed-loop (web or mobile)

### Clear-fridge

1. Pantry: only odd leftovers (e.g. ½ onion, ketchup sauce, 2 eggs, small ribs).
2. Chat: ask for a meal that needs **no** shopping; approve schedule for tonight.
3. Calendar: meal present; availability `ok` (or honest short).
4. Confirm cooked → pantry deducted / row gone at 0.

### Same-slot warn

1. Calendar: add dinner for a date.
2. Chat: plan a **different** dinner same date + meal_type.
3. Expect: assistant **warns** slot occupied; may still create duplicate (v1).

### Shopping merge

1. Shopping already has unchecked 蒜頭 2 顆.
2. Chat or Calendar add 蒜頭 3 顆 again.
3. Expect: one row, qty 5 (not two rows).

## Acceptance

- [x] Manual checklist documented (this file)
- [ ] Optional: Maestro chat HITL flow when stubs exist (deferred)

## Note

Full Maestro chat closed-loop deferred: HITL approve + LLM non-determinism. Prefer Vitest for state; use this checklist for release smoke.
