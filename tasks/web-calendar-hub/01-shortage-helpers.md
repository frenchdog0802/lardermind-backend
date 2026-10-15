# Task 01: Shortage helpers + Vitest

**Depends on:** —  
**Repo:** `backend-cf/`

## Goal

Extract pantry-pool shortage comparison for reuse by availability (and keep confirm behavior).

## Work

1. Add helpers in `db/meal-plan.ts` (or small sibling module): virtual pool from pantry rows; allocate ingredients; return `ok` | `short` | `unknown` + shortages.
2. Fail-first Vitest for: ok with enough stock; short when missing; unknown without recipe_id; week allocation consumes pool across two meals.

## Acceptance

- [ ] Preview path does not call `updatePantryItem`
- [ ] Two meals sharing one ingredient: second can go short if pool exhausted
- [ ] Tests pass

## Test

`npm test` in `backend-cf` filtered to new/related tests.
