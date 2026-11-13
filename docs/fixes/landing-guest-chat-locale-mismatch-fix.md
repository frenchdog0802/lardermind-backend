# Fix: Landing guest chat locale mismatch

**Bug:** [landing-guest-chat-locale-mismatch.md](../bugs/landing-guest-chat-locale-mismatch.md)  
**RCA:** [landing-guest-chat-locale-mismatch-rca.md](../rca/landing-guest-chat-locale-mismatch-rca.md)

## Fix approach

Add an optional `fixedLanguage?: 'en' | 'zh'` prop to `GuestChatBox`. When set, all `t(...)` calls use `i18n.getFixedT(fixedLanguage)` (or `t(key, { lng: fixedLanguage })`) so the embed ignores global `appLanguage`.

`MarketingLanding` passes `fixedLanguage="en"`.

Also re-seed / refresh the welcome message when `fixedLanguage` or resolved lng for the box changes.

Do **not** change global i18n or wipe `appLanguage` on landing visit (would break logged-in language preference).

## Alternatives considered

| Option | Why not |
|--------|---------|
| Hard-code English strings inside GuestChatBox | Duplicates i18n; harder to keep zh for in-app guest use |
| Detect landing route and force `i18n.changeLanguage('en')` | Side-effect mutates global language for the whole SPA |
| Translate entire MarketingLanding via i18n | Out of scope for this bug; larger product decision |

## Scope

- `frontend/src/components/GuestChatBox.tsx`
- `frontend/src/components/MarketingLanding.tsx`
- Small unit/regression test if a GuestChatBox test harness exists; otherwise a focused test on fixed-T usage / smoke assertion

No backend changes.

## Rollback

Revert the two component changes.

## Risks

Low. In-app callers omit `fixedLanguage` → unchanged behavior.

## Regression plan

1. `appLanguage=zh` → landing GuestChatBox still English; Settings still Chinese after login.
2. `appLanguage=en` → landing GuestChatBox English (unchanged).
3. GuestChatBox elsewhere without prop still follows `appLanguage`.
4. Fail-first: assert MarketingLanding passes `fixedLanguage="en"` (or component test that fixed T returns EN keys).
