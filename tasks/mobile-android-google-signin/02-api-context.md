# Task 02: API + authContext

## Goal

Wire `auth.googleLogin` and `loginWithGoogle` using the same session storage as email login.

## Steps

1. Add `googleLogin(idToken)` → `POST auth/google-login` `{ token }`.
2. Add `loginWithGoogle` on `AuthContext`: call `signInForIdToken` → `auth.googleLogin` → SecureStore + AsyncStorage.
3. Map cancel / errors to `AuthResponse.message`.

## Acceptance

- [ ] API method exists and matches Worker contract
- [ ] Context exposes `loginWithGoogle`
- [ ] Success path identical session persistence to email login
