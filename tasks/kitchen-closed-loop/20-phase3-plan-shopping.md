# Phase 3 (outline): Plan ↔ shortage ↔ shopping

**Status:** Outline only — expand after Phase 2.  
**Do not code yet.**

## Intent

After scheduling (soft reserve), surface shortages and let Chat/Calendar offer shopping list adds with HITL/consent.

## Likely work

1. After `planMeals` / schedule, compute deficits vs soft-reserve pool.
2. Prompt + follow-up: offer `addItemsToShoppingList` (separate HITL).
3. Reuse calendar hub week shortage aggregation where possible.
4. No silent shopping writes inside plan execute.

## Exit criteria

- [ ] Concrete tasks exist
- [ ] User can go plan → see short → approve shopping without leaving Chat (or clear Calendar CTA)
