# Phase 5 (outline): Chat multi-day orchestration

**Status:** Outline only — expand after Phases 1–4 and [chat-meal-plan-to-calendar](../chat-meal-plan-to-calendar/) (`planMeals`).  
**Do not code yet.**

## Intent

「幫我規劃 10 天…」runs a bounded tool sequence: inspect → schedule → report reserves/shortages → offer shopping — without claiming real deduct on schedule.

## Likely work

1. System prompt playbook for the sequence (within `CHAT_RECURSION_LIMIT`).
2. Ensure tools from Phases 1–4 are sufficient (thin helpers only if needed).
3. Disclose low recipe variety; offer `createRecipe` when appropriate.
4. Smoke: multi-day plan never says「沒有刪除工具」or「已扣庫存」from schedule alone.

## Exit criteria

- [ ] Concrete tasks exist
- [ ] Epic success criteria in feature doc can be checked off
