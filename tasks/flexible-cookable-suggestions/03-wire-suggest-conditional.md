# Task 03: Wire conditional status into `suggestMealsFromPantry`

**Phase:** A  
**Status:** Done  
**Blocked by:** 01, 02

## Intent

Fuse classification into existing suggest path without breaking `cookable` boolean consumers.

## Work

1. Load `assumeBasicSeasonings` inside `suggestMealsFromPantry` (prefs for user).
2. Set `cookStatus`, keep `cookable === (status === 'cookable')`.
3. Add `conditionalSeasonings` / optional `missingMains`; scoring +50 for conditional.
4. Content aggregates: `conditionallyCookableCount`, echo `assumeBasicSeasonings`.
5. Extend `mealSuggestionsCardData` with `cookStatus` (+ conditional fields).

## Acceptance

- [ ] Existing ranking still prefers fully cookable first.
- [ ] Conditional recipes remain in top list when they have pantry overlap.
- [ ] Card payload includes status fields for clients.
