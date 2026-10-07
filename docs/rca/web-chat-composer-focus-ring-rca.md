# RCA: Web chat composer shows extra focus ring on click

**Bug:** `docs/bugs/web-chat-composer-focus-ring.md`  
**Status:** Confirmed via code inspection + user report  

---

## Root Cause

The composer wrapper in `AICookingAssistant.tsx` applies Tailwind focus-within ring utilities:

`focus-within:ring-2 focus-within:ring-herb/30`

When the inner `textarea` receives focus (click or keyboard), `:focus-within` matches on the wrapper and Tailwind draws a **box-shadow ring outside** the existing `border border-line`. Idle state has one frame; focused state has border **plus** ring — perceived as an extra box jumping out on click.

## Contributing Factors

1. Composer chrome already owns a visible `border`; adding `ring-2` duplicates the “frame” affordance.
2. `focus-within:border-herb/40` alone would be a subtle tint; the ring is the dominant second layer.
3. Prior double-border fix (`border-0` on textarea) removed the inner square stroke but left wrapper focus ring unchanged.

## Affected Components

| Component | Role |
|-----------|------|
| `frontend/src/components/AICookingAssistant.tsx` | Composer wrapper `className` |

## Data / State Impact

None. Pure CSS / presentation.

## Timeline

Introduced with Warm Kitchen / agent chat composer chrome that used `focus-within:ring-*` for focus feedback. Exact commit not required for fix.

## Why it wasn't caught earlier

- Focus ring is a common a11y pattern and may have been treated as intentional polish.
- Idle-state QA would not show the extra frame; it only appears on focus.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** `focus-within:ring-2` on the bordered wrapper — matches user description and source.
2. Less likely: global `*:focus-visible` outline on textarea — composer already has `focus:outline-none`; outline would be square on the control, not the outer rounded ring users described.
3. Unlikely: residual global `textarea` border — already cleared by `border-0` / `@layer base` fix.
