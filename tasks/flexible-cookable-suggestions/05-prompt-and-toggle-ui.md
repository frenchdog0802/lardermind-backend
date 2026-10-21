# Task 05: System prompt + toggle UI

**Phase:** A  
**Status:** Done  
**Blocked by:** 02, 03

## Intent

Agent language and user control for the seasoning assumption.

## Work

1. Update `system-prompt.ts`: conditional phrasing; never call conditional “fully cookable”; read prefs flag.
2. Extend prompt contract Vitest.
3. Settings (and/or chat chip): bind to `assumeBasicSeasonings` via existing preferences update path.

## Acceptance

- [ ] Prompt tests cover conditional + toggle semantics.
- [ ] User can turn assumption OFF and see effect on next suggest (manual or component test).
