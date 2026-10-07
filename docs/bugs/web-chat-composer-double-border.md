# Bug: Web chat composer shows square border over rounded field

**Status:** Resolved  
**Resolved by:** Composer `textarea` `border-0` + move global form borders into `@layer base`  
**RCA:** `docs/rca/web-chat-composer-double-border-rca.md`  
**Fix design:** `docs/fixes/web-chat-composer-double-border-fix.md`  

---

## Current Behavior

On the web Chat composer, the typing field appears as a rounded pill **and** a thin gray rectangle with sharp corners around it. Corner gaps make the control look like it has both rounded and square chrome.

## Expected Behavior

The composer field should show a **single** rounded border matching `rounded-[22px]` (Warm Kitchen chat chrome). No second, square outline from the inner control.

## Reproduction Steps

1. Open the web app Chat / AI cooking assistant screen.
2. Look at the bottom typing bar (placeholder: cooking / pantry / planning).
3. Observe the field edge: rounded fill/shape with a square gray frame at the bounding box corners.

## Environment

- App: `frontend/` (Vite / React)
- Browser: any (reproduced visually on desktop web)
- Screen: `AICookingAssistant` composer footer

## Related Files

- `frontend/src/components/AICookingAssistant.tsx` — composer wrapper + `textarea`
- `frontend/src/index.css` — global `input, textarea, select { border: … }`

## Impact Scope

- Cosmetic / UX polish on web Chat composer only.
- Does not affect send/attach logic, API, or mobile RN composer.
- Other pages that intentionally rely on the global form border are out of scope unless they also wrap a rounded chrome around a bare `textarea`.

## Reproducibility Notes

- Visual + code inspection: wrapper has `rounded-[22px] border`; `textarea` still receives a default border from global CSS without matching radius.
- Focusing the field can make the mismatch more obvious when the wrapper uses `focus-within:border-transparent`.

## Related Documents

- `docs/design/web-agent-chat-ux-design.md` (§3.3 Composer)
- `docs/features/web-agent-chat-ux.md`
