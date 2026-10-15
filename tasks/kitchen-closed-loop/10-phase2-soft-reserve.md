# Phase 2 (outline): Soft-reserve product contract

**Status:** Outline only — expand into concrete tasks after Phase 1 closeout.  
**Do not code yet.**

## Intent

Make「排入＝預留、煮完才真扣」explicit in API/agent surfaces without writing pantry qty on schedule.

## Likely work (to break down later)

1. Lock default window for `available` (open plans from today forward vs query range).
2. Reuse week/pool helpers from `db/meal-plan.ts` (same as availability).
3. Enrich `listPantry` and/or add a small read tool so Chat sees `on_hand` vs `available`.
4. Align Calendar / confirm docs language with [kitchen-closed-loop](../../docs/features/kitchen-closed-loop.md).
5. Vitest: available drops when a meal is planned; rises when plan deleted; confirm still writes on_hand.

## Exit criteria

- [ ] Concrete task files `11+` exist
- [ ] No `reserved_qty` column unless a new feature unlocks it
- [ ] Schedule still never mutates pantry qty
