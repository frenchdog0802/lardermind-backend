# Fix Design: Web chat composer focus outline flash

**Bug:** `docs/bugs/web-chat-composer-focus-outline-flash.md`  
**RCA:** `docs/rca/web-chat-composer-focus-outline-flash-rca.md`  

---

## Fix Approach

1. **`index.css`:** Move the global `*:focus-visible` rule into `@layer base` so Tailwind utilities (including `outline-none`) can override it — same cascade pattern as the composer double-border fix.
2. **Composer `textarea`:** Add `focus-visible:outline-none` alongside existing `focus:outline-none` so the field explicitly opts out of the a11y outline; focus cue remains the wrapper `focus-within:border-herb/40`.

This is the smallest fix that addresses the confirmed cascade root cause and makes the composer opt-out explicit.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Composer-only `!outline-none` / inline style | Works as workaround; leaves unlayered global outline fighting utilities elsewhere |
| Remove global `*:focus-visible` entirely | Weakens keyboard focus visibility site-wide |
| Suppress via wrapper `overflow-hidden` | Hides symptom; outline can still paint oddly; not a cascade fix |

## Scope of Change

- `frontend/src/index.css` — move `*:focus-visible` into `@layer base`
- `frontend/src/components/AICookingAssistant.tsx` — `focus-visible:outline-none` on composer `textarea`
- `frontend/src/components/AICookingAssistant.composer.test.ts` — regression asserts
- Docs: mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Restore unlayered `*:focus-visible` block and remove `focus-visible:outline-none` from the composer `textarea`.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Other controls lose forced outline when they use `outline-none` | Expected: utilities can now win; intentional opt-out |
| Reduced focus visibility on composer | Wrapper border + `focus-within:border-herb/40` remain |
| Keyboard a11y on other fields | Base-layer outline still applies where utilities do not clear it |

## Regression Test Plan

1. **Unit (node:test):** Assert `*:focus-visible` lives inside `@layer base`, and composer `textarea` `className` includes `focus-visible:outline-none`.
2. **Manual:** Click composer — single rounded border only; no dark outline flash.

## Confirmation that root cause is fixed

Focused composer shows at most one border frame; global focus outline no longer paints over the field.
