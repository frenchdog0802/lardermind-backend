# Task 20: Multi-meal shortage attribution Vitest

**Depends on:** Phase 1 preferred  
**Repo:** `backend-cf/`

## Goal

Regression for Resolved bug: two short meals in range → each `meals[]` entry labeled; shortages for dish A not required under dish B’s entry.

## Work

1. Fixture two recipes / two plans, pantry insufficient for both.
2. Assert `serving_date`, `meal_name`, and meal-local shortage names.
3. Assert week aggregate may union names but per-meal arrays stay isolated.

## Acceptance

- [ ] Fail if labels missing or cross-meal contamination in `meals[].shortages`
- [ ] Tests pass

## Test

```bash
cd backend-cf && npm test -- meal-plan-availability
```
