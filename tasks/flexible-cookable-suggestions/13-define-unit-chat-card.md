# Task 13: Chat define-unit card + hidden re-suggest

**Phase:** B  
**Status:** Done  
**Blocked by:** 12

## Intent

Replace typing “1包幾克” with `[1 包排骨 = ___ g] [確認]`.

## Work

1. Web + mobile: render `actions[]` with `define_unit` inside/near meal suggestions.
2. Confirm → API upsert → append **hidden** context message → run chat turn that re-calls suggest.
3. Refresh suggestions bubble (replace or append per existing chat patterns).

## Acceptance

- [ ] Invalid/empty ratio cannot submit.
- [ ] After confirm, user need not retype the original cookability question.
- [ ] Hidden line not shown as normal user chat (or clearly non-user chrome).
