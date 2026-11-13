# Bug: Chat fails with “no tool was started” on grocery-list asks

**Status:** Resolved  
**Severity:** Critical  
**Type:** Logic / agent loop  
**Surface:** `looksLikeMutatingUserRequest` + `runAgentTurn` mutation nudge path

---

## Current behavior

A plain grocery-list / planning request sometimes returns:  
“I could not update your data because no tool was started. Nothing was saved…”  
Rephrasing often works.

## Expected behavior

Planning / “what should I buy” / draft grocery-list asks get a normal assistant reply (and optional offer to save via tools). Hard fallback only when the user clearly asked to **write** stored data and tools still did not run.

## Reproduction

1. Signed-in or guest chat: ask for a grocery list of missing items / week plan shopping without explicitly “add to my shopping list”.
2. Observe hard failure string instead of a list.

## Related files

- `backend-cf/src/agent/tools/mutating-intent.ts`
- `backend-cf/src/agent/agent-loop.ts` (mutation nudge + `MUTATION_NO_TOOL_FALLBACK`)

## Related documents

- Issue #2 full-feature comment todo
