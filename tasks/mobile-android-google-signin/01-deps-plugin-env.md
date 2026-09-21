# Task 01: Dependency, plugin, env

## Goal

Install `@react-native-google-signin/google-signin`, add Expo config plugin, document Web Client ID env.

## Steps

1. `npm install @react-native-google-signin/google-signin` in `mobile/`.
2. Add plugin to `app.json` `expo.plugins`.
3. Update `.env.example` with `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` (Web Client ID; comment Android client is Console-only).
4. Add `src/services/googleSignIn.ts` with `configureGoogleSignIn` + `signInForIdToken`.

## Acceptance

- [ ] Package in `package.json`
- [ ] Plugin listed in `app.json`
- [ ] `.env.example` documents Web Client ID
- [ ] Service module compiles; no native rebuild required for this task alone (rebuild noted for acceptance)
