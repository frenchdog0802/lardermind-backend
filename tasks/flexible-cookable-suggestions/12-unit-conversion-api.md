# Task 12: Authenticated upsert API + Vitest B1/B2

**Phase:** B  
**Status:** Done  
**Blocked by:** 10, 11

## Intent

Card Confirm writes ratio without requiring free-text chat.

## Work

1. Add route e.g. `POST /api/unit-conversions` (user-scoped upsert).
2. Vitest HTTP or db-level: B1 action shape; B2 after upsert suggest becomes qty-correct.
3. Optional later: agent `setUnitConversion` tool — out of scope unless needed for text-only.

## Acceptance

- [ ] Unauthorized → 401.
- [ ] B1/B2 pass.
