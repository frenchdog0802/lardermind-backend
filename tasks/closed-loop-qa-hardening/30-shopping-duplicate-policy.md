# Task 30: Shopping duplicate policy

**Depends on:** Phase 0 decision #2  
**Repo:** `backend-cf/` (+ frontend Calendar if merge)

## Goal

One policy for agent `addItemsToShoppingList` and Calendar “Add missing”.

## Work

Per locked choice in design Phase 0 — implement merge **or** document INSERT + Vitest row counts; align Calendar client.

## Acceptance

- [ ] Policy matches lock
- [ ] Vitest covers two adds of same name+unit
- [ ] Calendar path does not contradict agent

## Test

`npm test` in `backend-cf` (+ frontend tests if touched)
