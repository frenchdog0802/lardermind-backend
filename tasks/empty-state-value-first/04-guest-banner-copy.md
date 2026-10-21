# Task 04: Guest banner / save benefit copy

**Phase:** B  
**Status:** Done  
**Blocked by:** —

## Intent

Make guest chrome answer “what do I keep if I save?” instead of status-only “trying as guest.”

## Work

1. Mobile: update `auth.guestBanner` / `guestBannerCta` in `mobile/src/i18n/locales/en.json` and `zh.json`.
   - Benefit: keep pantry, recipes, and this kitchen (wording can be compact).
   - Keep one line + one CTA.
2. Web: align `landing.guestFooter`, `guestSavePrompt`, and/or `guestSaveCta` in `frontend/src/i18n/locales/en.json` and `zh.json` with the same benefit idea.
3. Spot-check Mobile Chat guest banner wrap on a narrow width.

## Acceptance

- [x] en + zh state persistence benefit (not status-only).
- [x] No new CTAs or layout redesign.
- [x] Paste-first empty CTAs unchanged.
