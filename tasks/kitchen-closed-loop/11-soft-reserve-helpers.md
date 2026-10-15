# Task 11: Soft-reserve helpers

**Phase:** 2  
**Goal:** Compute on-hand / reserved / available from pantry + planned meals (virtual allocation).

## Work

1. Add `computePantrySoftReserve(db, userId, from, to)` in `meal-plan.ts` (or small helper module) that returns per pantry row: `on_hand`, `reserved`, `available`.
2. Reuse `buildPantryPool` + plan allocation order (same as availability).
3. Vitest: two meals sharing one ingredient reserve correctly.

## Acceptance

- [ ] available = max(0, on_hand - reserved)
- [ ] CONFIRMED/SKIPPED meals do not reserve
- [ ] No D1 writes
