# Fix Design: Web chat composer focus ring

**Bug:** `docs/bugs/web-chat-composer-focus-ring.md`  
**RCA:** `docs/rca/web-chat-composer-focus-ring-rca.md`  

---

## Fix Approach

Remove `focus-within:ring-2` and `focus-within:ring-herb/30` from the composer wrapper in `AICookingAssistant.tsx`.

Keep the single rounded `border` as the only frame. Optionally keep `focus-within:border-herb/40` as a subtle focus tint (no second layer). Prefer keeping the border tint so keyboard/pointer focus is still slightly visible without a ring.

This is the smallest change that removes the confirmed extra frame.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Remove all `focus-within:*` including border tint | Works, but loses any focus cue; ring removal alone is enough |
| Replace ring with `outline` on wrapper | Wrapper is not focusable; still a second frame |
| Suppress only via `ring-0` | Equivalent noise; deleting the ring classes is clearer |

## Scope of Change

- `frontend/src/components/AICookingAssistant.tsx` — drop ring utilities on composer wrapper
- `frontend/src/components/AICookingAssistant.composer.test.ts` — assert wrapper has no `focus-within:ring-*`
- Docs: mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Restore `focus-within:ring-2 focus-within:ring-herb/30` on the wrapper.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Reduced focus visibility for a11y | Border remains; optional herb border tint on focus; textarea still focuses normally |
| Other composers (e.g. DemoChatBox) unchanged | Out of scope; only Chat assistant composer reported |

## Regression Test Plan

1. **Unit (node:test):** Assert composer wrapper `className` does **not** include `focus-within:ring-`.
2. **Manual:** Click composer — single rounded border only; no outer ring flash.

## Confirmation that root cause is fixed

Focused composer shows at most one border frame; no Tailwind ring layer around the field.
