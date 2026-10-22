# 03 — Pricing copy + fallbacks

## Goal

Clarify Pro benefits; always show Pro prices when plans API fails.

## Acceptance

- [ ] No “High-volume AI” / “high-volume AI” string
- [ ] Fallback monthly `$4.99/mo` and yearly `$39.99/yr` cards render on API error
- [ ] Limit rows still show concrete numbers

## Test

- [ ] With API up: live plans
- [ ] Force fail (devtools offline): fallbacks visible
