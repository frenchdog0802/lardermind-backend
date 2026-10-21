# Task 02: Prompt contract Vitest

**Phase:** A  
**Status:** Done  
**Blocked by:** 01

## Intent

Lock the new contract in tests so paste-first and value-first cannot silently regress each other.

## Work

1. Extend `backend-cf/src/agent/system-prompt.test.ts` to assert the built prompt covers:
   - Knowledge / generic-plan → answer first when empty (value-first / refuse-first forbidden for those intents).
   - Stock-dependent empty cook → paste fridge/shopping list.
   - Still forbid inventing pantry without approval / first-win HITL order.
2. Run `vitest` for the system-prompt suite; fix assertions to match final wording from task 01.

## Acceptance

- [x] New tests fail against pre-change prompt and pass after task 01.
- [x] Existing system-prompt tests still pass.
