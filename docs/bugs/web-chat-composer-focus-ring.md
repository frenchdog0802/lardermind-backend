# Bug: Web chat composer shows extra focus ring on click

**Status:** Resolved  
**Resolved by:** Removed composer wrapper `focus-within:ring-*` (kept subtle `focus-within:border-herb/40`)  
**RCA:** `docs/rca/web-chat-composer-focus-ring-rca.md`  
**Fix design:** `docs/fixes/web-chat-composer-focus-ring-fix.md`  

---

## Current Behavior

When the user clicks (focuses) the web Chat composer typing field, an extra frame appears around the already-bordered rounded input — a second ring that was not visible when idle.

## Expected Behavior

Focusing the composer should not add a second outer ring/frame. The field should keep a single rounded border (idle chrome only, or at most a subtle border-color change without an extra ring layer).

## Reproduction Steps

1. Open the web app Chat / AI cooking assistant screen.
2. Look at the composer typing field (rounded pill).
3. Click inside the field to focus it.
4. Observe an additional ring/frame appearing outside the existing border.

## Environment

- App: `frontend/` (Vite / React)
- Browser: any (desktop web)
- Screen: `AICookingAssistant` composer

## Related Files

- `frontend/src/components/AICookingAssistant.tsx` — composer wrapper classes

## Impact Scope

- Cosmetic / UX on web Chat composer focus state only.
- Does not affect send logic, API, or message transcript.

## Reproducibility Notes

- Reproducible on every focus of the composer field.
- Distinct from the resolved square inner-border bug (`web-chat-composer-double-border`).

## Related Documents

- `docs/bugs/web-chat-composer-double-border.md` (related but different chrome issue)
- `docs/design/web-agent-chat-ux-design.md` (§3.3 Composer) if present
