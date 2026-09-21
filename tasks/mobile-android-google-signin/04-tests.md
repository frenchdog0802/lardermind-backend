# Task 04: Tests

## Goal

Unit coverage for API, context (optional light), and screens with Google mocks.

## Steps

1. Extend `api-auth.test.ts` for `googleLogin`.
2. Mock `@react-native-google-signin/google-signin` in `jest.setup.js`.
3. Update `auth-screens.test.tsx`: ios = no Google; android Platform mock = Google present + press.
4. Add i18n mock keys for Google labels if needed.

## Acceptance

- [ ] `npm test` in `mobile/` passes
- [ ] No reliance on real native Google module in Jest
