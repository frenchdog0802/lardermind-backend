# Task 12: Enrich listPantry with soft-reserve fields

**Phase:** 2  
**Goal:** Chat `listPantry` returns on_hand, reserved, available (quantity stays on-hand for compat).

## Work

1. Default window: today → today+14 (UTC or pass from agent context later).
2. Update `execute.ts` `listPantry` payload + summary to mention available when reserved > 0.
3. Optional read tool `getMealPlanAvailability` can wait for Phase 3/5.

## Acceptance

- [ ] Tool JSON includes soft-reserve fields
- [ ] Vitest covers enriched listPantry
