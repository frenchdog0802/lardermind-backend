# RCA: Web chat composer shows square border over rounded field

**Bug:** `docs/bugs/web-chat-composer-double-border.md`  
**Status:** Confirmed via code inspection + screenshot  

---

## Root Cause

The Chat composer draws **two** borders:

1. **Wrapper** in `AICookingAssistant.tsx`: `rounded-[22px] border border-line bg-surface …`
2. **Inner `textarea`**: global rule in `index.css` applies `border: 1px solid var(--line)` to all `textarea` elements, with **no** `border-radius`.

The inner control’s border is rectangular; the wrapper’s border is rounded. Together they produce the “rounded + square” frame.

Additionally, those global form rules sit **outside** any `@layer`, so they sit above Tailwind’s `@layer utilities` in the cascade. A plain `border-0` class may not neutralize the global border unless the base rule is layered (or `!important` is used).

## Contributing Factors

1. Composer design intentionally puts chrome on a wrapper and keeps the `textarea` visually bare (`bg-transparent`, `focus:outline-none`) but never clears the global border.
2. `focus-within:border-transparent` on the wrapper hides the rounded border on focus, leaving the square `textarea` border more visible.
3. Global form chrome is useful for bare inputs, but conflicts when a parent already owns the border.

## Affected Components

| Component | Role |
|-----------|------|
| `frontend/src/components/AICookingAssistant.tsx` | Composer wrapper + `textarea` |
| `frontend/src/index.css` | Global `input, textarea, select` border |

## Data / State Impact

None. Pure CSS / presentation.

## Timeline

Introduced when the web composer adopted wrapper chrome (`rounded-[22px] border …`) while global `textarea` borders remained. Exact commit not required for fix.

## Why it wasn't caught earlier

- Visual QA may have treated it as intentional “double stroke” or missed corner detail at default zoom.
- No regression asserting composer `textarea` has no own border.
- Global CSS vs Tailwind layer interaction is easy to miss in review.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** Global `textarea` border + rounded wrapper border — matches screenshot and source.
2. Less likely: Browser `:focus-visible` outline — ruled out as primary; global outline is herb green / 2px offset, not the gray line-color square frame.
3. Unlikely: Missing `overflow-hidden` alone — would not invent a square stroke without a second border source.
