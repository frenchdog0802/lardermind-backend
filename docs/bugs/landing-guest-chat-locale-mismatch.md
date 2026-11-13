# Bug: Landing guest chat locale mismatches English marketing copy

**Status:** Resolved  
**Severity:** Major  
**Type:** UI / i18n  
**Surface:** Web marketing landing (`MarketingLanding` + `GuestChatBox`)

---

## Current behavior

On the public landing “See it in action” section:

- Left column marketing copy is **English** (hard-coded).
- Right column live guest chat UI strings are **Traditional Chinese** (welcome, placeholder, chips, footer, mint-error).
- Screenshot also showed guest mint failure: “無法開始訪客試用。改為註冊”.

## Expected behavior

While the marketing landing remains English hard-coded, the embedded guest chat chrome (labels, welcome, placeholders, CTAs, errors) must also be **English**, independent of any previously saved in-app language preference.

(Guest mint failure is a separate reliability issue if still reproducible after locale fix; document separately if it persists.)

## Reproduction

1. In the app (or DevTools), set `localStorage.appLanguage = "zh"` (or switch Settings language to 中文).
2. Open the logged-out marketing landing (`/`).
3. Observe left copy in English and `GuestChatBox` strings in Chinese.

Environment: Production / staging web SPA; browser with prior `zh` preference.

## Related files

- `frontend/src/components/MarketingLanding.tsx` (hard-coded EN)
- `frontend/src/components/GuestChatBox.tsx` (`useTranslation()` / global i18n)
- `frontend/src/i18n/index.ts` (`resolveStoredLanguage` → `appLanguage`)
- `frontend/src/i18n/locales/en.json`, `zh.json` (`ai.guest*`)

## Impact

Landing looks broken / half-translated to English-first visitors who previously used Chinese in-app (or shared devices). Undermines conversion polish shipped in `landing-page-conversion-polish`.
