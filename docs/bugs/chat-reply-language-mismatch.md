# Bug: English chat gets Chinese replies / tool item names

**Status:** Resolved  
**Severity:** Critical  
**Type:** Prompt / i18n  
**Surface:** Chat agent (`backend-cf` system prompt + tool args); guest + signed-in

---

## Current behavior

English user prompts sometimes get Chinese examples or Chinese shopping/pantry item names and units (e.g. 「雞蛋 6 顆…」, shopping HITL 「鹽 / 1 包」).

## Expected behavior

Reply language matches the user’s latest message language. Tool argument `name` and `unit` strings use that same language.

## Reproduction

1. Set app/UI language aside; send an English chat prompt asking for a plan or grocery list.
2. Observe Chinese fragments in the assistant reply and/or approve a shopping add with Chinese names.

## Related files

- `backend-cf/src/agent/system-prompt.ts`
- `backend-cf/src/agent/tools/definitions.ts`
- `backend-cf/src/agent/auto-title.ts` (has match-language rule; chat does not)

## Severity rationale

First impression for English new users on the public landing demo.

## Related documents

- Issue #2 must-fix language + full-feature shopping language todo
