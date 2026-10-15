# Task 02: Availability route

**Depends on:** 01  
**Repo:** `backend-cf/`

## Goal

Expose `GET /api/meal-plan/availability?from=&to=` before `/:id`.

## Work

1. Implement `computeWeekAvailability` per design.
2. Wire route; 400 on missing/invalid dates.
3. Route/domain tests: auth 401; happy path; CONFIRMED meals do not consume pool.

## Acceptance

- [ ] Response shape: `{ meals, weekShortages }`
- [ ] No pantry writes
- [ ] Tests pass

## Test

Vitest for meal-plan availability / domain-crud.
