# Fix: Plan-from-prompt / invent qty / conflicting pantries

**Bug:** `docs/bugs/chat-plan-from-prompt-ingredients.md`  
**RCA:** `docs/rca/chat-plan-from-prompt-ingredients-rca.md`

## Fix approach

Add system-prompt rules:

1. **Ingredients in the user message** count as an ephemeral pantry for this turn — plan dinners/grocery from them **before** (or without) requiring addPantryItems.
2. After the plan, **one** optional offer to save via addPantryItems.
3. **Never invent quantities** for HITL adds — omit quantity only if schema allows, else ask or use quantity `1` with unit blank/unknown only when user did not specify — prefer asking or leaving quantity as user-stated. Since schema requires number: use `1` with a note in the approval card text that qty was unspecified, OR ask first. Prefer: do not call addPantryItems until user confirms quantities or accepts “unknown qty = 1 pcs”.
4. **Merge** prompt list with listPantry results; never say two conflicting pantries / refuse to plan.

Fail-first: system-prompt.test asserts these clauses.

## Scope

- `system-prompt.ts` + test  
- Optionally soften addPantryItems description: “Do not invent quantities; ask or omit unit; if quantity unknown use 1 and say so in the message.”

## Rollback

Revert prompt paragraphs.
