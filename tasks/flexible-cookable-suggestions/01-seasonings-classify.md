# Task 01: DEFAULT_SEASONINGS + classify helper

**Phase:** A  
**Status:** Done  
**Blocked by:** none

## Intent

Pure helper for seasoning membership and cook-status classification, independent of D1.

## Work

1. Add `backend-cf/src/agent/tools/seasonings.ts` (or `lib/`) with:
   - `DEFAULT_SEASONINGS` constant (spec list).
   - `isDefaultSeasoning(name: string): boolean` using shared `normalizeName`.
   - `classifyCookStatus(missing: string[], assumeBasicSeasonings: boolean)`.
   - `missingMains(missing: string[]): string[]`.
2. Unit tests for normalize edge cases (trim / empty).

## Acceptance

- [ ] Helper has no DB dependency.
- [ ] Classification matches design truth table (cookable / conditional / uncookable).
- [ ] Vitest green for helper file.
