# Task 10: Soft-reserve cancel restores available

**Depends on:** — (Phase 1; no Phase 0 required)  
**Repo:** `backend-cf/`

## Goal

Fail-first then pass: after planning a meal that soft-reserves stock, cancel/delete/skip restores `available` to on-hand without changing pantry `quantity`.

## Work

1. Add Vitest covering:
   - Seed pantry + recipe + `PLANNED` meal
   - Soft-reserve / listPantry-style available decreases
   - Delete or skip meal plan
   - Available equals on_hand again; DB qty unchanged
2. Prefer helpers already used by `meal-plan-availability.test.ts` / domain-crud.

## Acceptance

- [ ] Test fails if cancel forgets to drop plan from active allocation set
- [ ] on_hand never written on cancel
- [ ] `npm test` in `backend-cf` passes for new/related files

## Test

```bash
cd backend-cf && npm test -- meal-plan-availability
```
(or the file chosen for the suite)
