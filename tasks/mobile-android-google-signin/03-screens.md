# Task 03: Login + SignUp Android UI

## Goal

Show Google CTA on Android Login and SignUp; wire to `loginWithGoogle`.

## Steps

1. `LoginScreen`: Android-only Google button + `common.or` divider; call `loginWithGoogle`.
2. `SignUpScreen`: same (label `signUpGoogle`).
3. Disable while `submitting`; surface errors.

## Acceptance

- [ ] Google visible only when `Platform.OS === 'android'`
- [ ] Success clears into authenticated app state
- [ ] Cancel / failure shows i18n-friendly error
