# RCA: Landing guest chat locale mismatch

**Bug:** [landing-guest-chat-locale-mismatch.md](../bugs/landing-guest-chat-locale-mismatch.md)

## Root cause

`MarketingLanding` copy is hard-coded English. `GuestChatBox` renders all UI via `useTranslation()` against the **global** i18n instance, whose `lng` is `localStorage.appLanguage` (`en` | `zh`, default `en`).

If `appLanguage` is `zh` (from Settings or a prior session), the landing page stays English while the embedded guest chat switches to Chinese.

## Contributing factors

1. Landing conversion polish intentionally kept marketing strings English-only and out of i18n.
2. `GuestChatBox` was designed for in-app guest/first-win flows that should follow user language — correct there, wrong when reused on the EN marketing shell without a locale override.
3. Welcome message is seeded with `t('ai.guestWelcome')` at mount; it follows whatever `lng` is active at that moment.

## Affected components

- `GuestChatBox` (string source)
- `MarketingLanding` (embed site; no locale prop today)
- `frontend/src/i18n/index.ts` (storage-backed language)

## Data / state impact

None (display only). `localStorage.appLanguage` unchanged.

## Timeline

Introduced when landing switched from scripted `DemoChatBox` to live `GuestChatBox` (guest first-win / landing polish), without forcing English for the marketing embed.

## Why not caught earlier

Manual landing QA often on a fresh profile (`appLanguage` unset → `en`). Mismatch only appears after Chinese was selected in Settings.

## Out of scope for this RCA

Guest mint API failure (“無法開始訪客試用”) is not explained by locale; treat as a separate bug if still failing after the locale fix.
