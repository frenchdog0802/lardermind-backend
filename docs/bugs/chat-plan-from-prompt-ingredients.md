# Bug: First prompt invents pantry flow instead of planning from ingredients in message

**Status:** Resolved  
**Severity:** Critical  
**Type:** Prompt / agent behavior  
**Surface:** Cooking system prompt + first-win orchestration

---

## Current behavior

“I have chicken, rice, spinach, eggs; plan 3 dinners…” → “pantry is empty”, HITL addPantryItems with **invented quantities**, unit questions, or “two conflicting pantries” dead-end when a saved pantry also exists.

## Expected behavior

1. Use ingredients named in the user message as an **ephemeral** pantry for planning; answer with a plan first.
2. Offer to save to pantry after (HITL); do **not** invent quantities — omit or ask.
3. Merge prompt ingredients with saved pantry; never dead-end on “two pantries”.

## Reproduction

1. Empty or sparse pantry; English prompt listing ingredients + ask for dinners.
2. Optionally: saved pantry + different prompt list + week plan + grocery.

## Related files

- `backend-cf/src/agent/system-prompt.ts`
