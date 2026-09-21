# 03 — Composer chrome (P0)

## Goal

Make the sticky composer the clear primary control (contrast, height, send states).

## Acceptance

- [ ] Field: `bg-surface` + `border-line` + soft `shadow-sm` (or token equivalent)
- [ ] Min height ~52px; preserve auto-grow / max-height
- [ ] Focus-within herb ring retained or strengthened
- [ ] Send muted/ghost when `!canSend`; herb fill only when ready
- [ ] Uses updated `ai.placeholder`
- [ ] No attach control added
- [ ] Streaming / HITL disable behavior unchanged
