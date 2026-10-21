# Task 10: `unit_conversion_table` + db helpers

**Phase:** B  
**Status:** Done  
**Blocked by:** Phase A closeout recommended (not hard-required)

## Intent

Persist per-user unit ratios.

## Work

1. Migration for `unit_conversion_table` per design.
2. Helpers: `upsertConversion`, `listConversionsForUser`, `findConversion(item, from, to)` with inverse.
3. Reject `ratio <= 0`.

## Acceptance

- [ ] Unique key `(user_id, item_name, base_unit, target_unit)`.
- [ ] Vitest for upsert + inverse apply math helper.
