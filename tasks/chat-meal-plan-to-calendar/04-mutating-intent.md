# Task 04: Mutating-intent calendar phrases

**Depends on:** — (can parallel with 01–03)  
**Repo:** `backend-cf/`

## Goal

Treat explicit “add to calendar / 加到行事曆” user text as mutating so the agent loop nudges tool use.

## Work

1. Extend `looksLikeMutatingUserRequest` ZH/EN patterns per design §4.
2. Do **not** add history-aware short-confirm heuristics in this task.
3. Add unit tests for positive/negative cases (e.g. 「規劃一週月子餐」 alone → false; 「幫我加到行事曆」 → true).

## Acceptance

- [ ] Consultative “規劃一週…” remains false
- [ ] Explicit calendar/menu write phrases return true
- [ ] Existing pantry/shopping cases still pass

## Test

`mutating-intent.test.ts` updates.
