# Task 11: Unit-aware suggest + `define_unit` actions

**Phase:** B  
**Status:** Done  
**Blocked by:** 10

## Intent

Detect 包↔g style gaps; emit structured actions; no silent convert.

## Work

1. In ingredient vs pantry compare, use conversion table when present.
2. On mismatch without ratio: mark missing + collect `actions[]` (`action_required: define_unit`).
3. Nest `actions` on `meal_suggestions` cardData + tool content.
4. Cap distinct actions (e.g. 5).

## Acceptance

- [ ] B1 oracle: mismatch → action, not cookable via invented math.
- [ ] With stored ratio, qty compare uses conversion (prep for B2).
