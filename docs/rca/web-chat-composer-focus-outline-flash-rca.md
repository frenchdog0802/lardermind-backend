# RCA: Web chat composer flashes dark outline on click

**Bug:** `docs/bugs/web-chat-composer-focus-outline-flash.md`  
**Status:** Confirmed via code inspection + user report  

---

## Root Cause

Global focus styling in `frontend/src/index.css` applies an unlayered outline to every focused control:

```css
*:focus-visible {
  outline: 2px solid var(--herb);
  outline-offset: 2px;
}
```

The composer `textarea` already has Tailwind `focus:outline-none`, but that utility lives in `@layer utilities`. **Unlayered CSS beats layered utilities**, so the global `*:focus-visible` outline wins on click (text fields match `:focus-visible` for mouse focus). `--herb` is a dark sage; against the linen background it reads as a black/near-black frame. Combined with `transition: all 200ms` on form controls, the outline appears as a flash.

## Contributing Factors

1. Composer chrome already owns a visible rounded `border` (plus optional `focus-within:border-herb/40`); a second outline duplicates the frame.
2. Prior focus-ring fix removed `focus-within:ring-*` but left the global outline path intact.
3. Textarea has `focus:outline-none` but not an explicit `focus-visible:outline-none`, and even with both, unlayered global CSS would still win until the cascade is corrected.

## Affected Components

| Component | Role |
|-----------|------|
| `frontend/src/index.css` | Unlayered `*:focus-visible` outline |
| `frontend/src/components/AICookingAssistant.tsx` | Composer `textarea` opt-out classes |

## Data / State Impact

None. Pure CSS / presentation.

## Timeline

Present after Warm Kitchen composer chrome + global a11y outline. Exact commit not required for fix. Surfaced after `web-chat-composer-focus-ring` was resolved and the ring was no longer the dominant flash.

## Why it wasn't caught earlier

- The earlier ring bug produced a stronger second frame; once removed, the global outline became the remaining flash.
- Idle-state QA does not show `:focus-visible` styles.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** Unlayered `*:focus-visible` outline overriding composer `focus:outline-none` — matches cascade rules and user description.
2. Less likely: residual `focus-within:ring-*` — already removed; wrapper has no ring classes.
3. Unlikely: global `textarea` border — already cleared by `border-0` / `@layer base` fix.
