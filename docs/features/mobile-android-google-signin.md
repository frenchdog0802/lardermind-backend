# Feature: Mobile Android Google Sign-In (native)

**Status:** Implemented (code + unit tests; operator must rebuild Android dev client and smoke Google login)  
**Scope:** Expo `mobile/` — **Android only** native Google Sign-In → existing `POST /api/auth/google-login` on `backend-cf`  
**Out of scope:** iOS Google / Apple Sign-In, AuthSession browser OAuth, Nest, changing Worker verify logic (unless `aud` mismatch forces a small allowlist)

---

## 1. Summary

Mobile auth is email/password only. Web already verifies Google ID tokens via `backend-cf` (`GOOGLE_CLIENT_ID` = Web client).

This feature adds **native Google Sign-In on Android** (dev build required), obtains a Google **ID token**, and exchanges it for the app JWT through the existing Worker route.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | **Android only** | User confirmed; iOS later |
| Client UX | **Native** (`@react-native-google-signin/google-signin`) | Better UX than AuthSession; Expo Go unsupported (already on dev client) |
| Token to backend | Google **ID token** as JSON `{ token }` | Same as web `google-login` |
| `webClientId` / Worker `aud` | Existing **Web** Client ID `603047692060-llk1cjf1b0f5bpdb9it5cvogk2b8haio.apps.googleusercontent.com` | Unchanged; ID token audience must match Worker |
| Android OAuth client | `603047692060-f8k0i592g2qn24qvqajosmk63t8odjv2.apps.googleusercontent.com` | Console registration only (package + SHA-1); not used as `aud` |
| Package | `com.lardermind.app` | `app.json` |
| Debug SHA-1 | `84:FA:ED:26:BB:87:FD:5E:42:7C:57:95:13:E0:1A:B5:56:01:F5:7B` | Operator registered |
| Backend | Prefer **no Worker change** | Same single `GOOGLE_CLIENT_ID` |
| Apple | Out of scope | iOS deferred |

### What changes

| Area | Before | After |
|------|--------|-------|
| Login / SignUp UI | Email only | Android: Google button + email |
| `api-auth` | signin / signup | + `googleLogin(idToken)` → `auth/google-login` |
| `authContext` | email flows | + `loginWithGoogle()` |
| Env | API base only | + `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` |
| `app.json` plugins | (no Google) | Google Sign-In config plugin |
| Native rebuild | — | Required after plugin add |

---

## 2. Requirements

### 2.1 Mobile (Android)

- Configure native Google Sign-In with **Web** Client ID as `webClientId`.
- On success, read **ID token**; call `POST …/auth/google-login` with `{ token }`.
- On success, store JWT in SecureStore + user in AsyncStorage (same as email login).
- Show Google CTA on **Login** and **SignUp** when `Platform.OS === 'android'`.
- Handle cancel / Play Services missing / missing ID token with i18n errors (keys already exist).
- Document: not Expo Go; rebuild dev client after install.

### 2.2 Backend

- No change if ID token `aud` equals existing `GOOGLE_CLIENT_ID`.
- Only if needed: allowlist additional audiences (ask before changing).

### 2.3 Ops / Console (operator)

| Item | Value |
|------|--------|
| Web Client ID | `…llk1cjf1b0f5bpdb9it5cvogk2b8haio…` |
| Android Client | package `com.lardermind.app` + debug SHA-1 (and later release/Play SHA-1) |
| Mobile env | `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` = Web Client ID |
| API | Point `EXPO_PUBLIC_API_BASE_URL` at Worker (`…/api/`) |

---

## 3. Non-goals

- iOS Google or Sign in with Apple.
- Expo AuthSession / browser OAuth.
- Storing Google Client Secret on device.
- Account unlink UI.
- Changing email/password auth.

---

## 4. Edge cases

| Case | Behavior |
|------|----------|
| User cancels Google sheet | Soft message; stay logged out |
| No Play Services | Clear error |
| Missing / empty ID token | Fail; do not call API |
| Backend 400/500 | Surface `message` or generic Google retry string |
| iOS build | No Google button (this feature) |
| Wrong SHA-1 / package | `DEVELOPER_ERROR` — ops fix Console |

---

## 5. Acceptance

- [x] Android Google button on Login + SignUp; iOS screens unchanged (no Google CTA).
- [x] Successful Android flow → app JWT session (same envelope as email). *(unit + wiring; device smoke = operator)*
- [x] Unit tests: `googleLogin` API path; screen / context coverage with mocks.
- [x] `.env.example` documents Web Client ID env var.
- [ ] Operator: rebuild Android dev client; smoke Google login against Worker.
