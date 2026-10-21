# Task 01: System prompt intent split

**Phase:** A  
**Status:** Done  
**Blocked by:** —

## Intent

Teach the agent to answer knowledge / generic-plan questions first when the kitchen is empty, without inventing pantry stock or dropping the paste-list path for stock-dependent asks.

## Work

1. Edit `backend-cf/src/agent/system-prompt.ts`:
   - Add **Empty or sparse kitchen — reply policy** (intent classes, answer-first shape, precedence, optional disclaimer, one invite).
   - Keep first-win paste orchestration and “empty + cook from what I have → paste list.”
   - State clearly: empty `listPantry` must not cause refuse-first on knowledge/generic-plan asks.
2. Keep replies concise; forbid meta-only “I will do X/Y/Z” bodies with no answer.
3. Do not invent pantry/recipes without HITL (existing rules stay).

## Acceptance

- [x] Prompt documents all three intent classes and value-first reply shape.
- [x] Stock-dependent empty path still asks to paste a list.
- [x] No schema/API changes.
