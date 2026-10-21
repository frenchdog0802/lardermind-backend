# Task 03: Manual smoke — dual intents

**Phase:** A  
**Status:** Pending (post-deploy)  
**Blocked by:** 01, 02

## Intent

Confirm live LLM behavior matches the contract on the original repro and the paste-list regression.

## Work

1. Empty kitchen (guest or fresh auth): send 「規劃第一天副食品」.
   - Expect usable day-1 plan in the **main** reply (portions / method / observation).
   - Expect paste/personalize as secondary, not lead refusal.
2. Same empty kitchen: send 「冰箱有什麼能煮」or「用現有食材建議晚餐」.
   - Expect ask to paste list; no invented pantry items claimed as saved.
3. Optional: 「幫我規劃晚餐」→ short generic value + clarify, not refuse-first.
4. Note results in `progress.md` (pass/fail + model if relevant).

## Acceptance

- [ ] Knowledge repro passes.
- [ ] Stock-dependent empty path still paste-list.
- [ ] Failures escalate (prompt few-shot follow-up) rather than inventing a classifier in v1.

## Note

Code + prompt contract shipped 2026-10-21. Run this smoke against staging/production after deploy.
