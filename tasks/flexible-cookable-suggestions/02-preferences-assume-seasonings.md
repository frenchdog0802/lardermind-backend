# Task 02: Preferences flag `assume_basic_seasonings`

**Phase:** A  
**Status:** Done  
**Blocked by:** none (can parallel 01)

## Intent

Persist toggle defaulting ON; expose via get/update preferences.

## Work

1. D1 migration: column on `user_preferences` (default true / 1).
2. Extend `UserPreferencesRow` / DTO / input in `preferences.ts`.
3. Ensure `getPreferences` / `updatePreferences` tool + HTTP domain path return/accept the flag.
4. Vitest: default true for new rows; update flips to false.

## Acceptance

- [ ] New users get `assumeBasicSeasonings: true`.
- [ ] Round-trip update works through existing preferences APIs/tools.
- [ ] No break to allergies / likes DTO fields.
