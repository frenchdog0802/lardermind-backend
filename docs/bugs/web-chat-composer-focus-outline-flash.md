# Bug: Web chat composer flashes dark outline on click

**Status:** Resolved  
**Resolved by:** Moved `*:focus-visible` into `@layer base`; composer `textarea` adds `focus-visible:outline-none`  
**RCA:** `docs/rca/web-chat-composer-focus-outline-flash-rca.md`  
**Fix design:** `docs/fixes/web-chat-composer-focus-outline-flash-fix.md`  

---

## Current Behavior

When the user clicks (focuses) the web Chat composer typing field, a dark (near-black) outline/frame flashes around the field — an extra stroke that is not present when idle.

## Expected Behavior

Focusing the composer should not show a second outline layer. The field should keep a single rounded border (idle chrome, or at most the subtle `focus-within` border tint) with no dark outline flash on click.

## Reproduction Steps

1. Open the web app Chat / AI cooking assistant screen.
2. Look at the composer typing field (rounded pill).
3. Click inside the field to focus it.
4. Observe a dark outline briefly appearing (or staying) around the field.

## Environment

- App: `frontend/` (Vite / React)
- Browser: desktop web (reproduced on click focus)
- Screen: `AICookingAssistant` composer

## Related Files

- `frontend/src/components/AICookingAssistant.tsx` — composer `textarea` / wrapper
- `frontend/src/index.css` — global `*:focus-visible` outline

## Impact Scope

- Cosmetic / UX on web Chat composer focus state only.
- Does not affect send logic, API, or message transcript.

## Reproducibility Notes

- Reproducible on focus of the composer field.
- Distinct from the resolved wrapper ring bug (`web-chat-composer-focus-ring`) and the resolved square inner-border bug (`web-chat-composer-double-border`).

## Related Documents

- `docs/bugs/web-chat-composer-focus-ring.md` (related; ring layer removed; this is a remaining outline flash)
- `docs/bugs/web-chat-composer-double-border.md` (related chrome issue)
