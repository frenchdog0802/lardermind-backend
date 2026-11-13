# Fix: Chat recipe unit coercion

**Bug:** [chat-recipe-unit-coercion.md](../bugs/chat-recipe-unit-coercion.md)  
**RCA:** [chat-recipe-unit-coercion-rca.md](../rca/chat-recipe-unit-coercion-rca.md)

## Fix Approach

1. System prompt: copy units exactly from the user’s wording / preferred measurement system; never convert cups↔ml or tbsp↔ml when writing tool args.  
2. Require `unit` on each ingredient in createRecipe/updateRecipe schema when quantity is set; keep provided unit string as-is (trim only).  
3. Default missing unit to empty string rather than inventing `pcs` when quantity is non-zero — or reject the ingredient with a tool error asking for unit.

## Alternatives Considered

| Option | Why not |
|--------|---------|
| Server-side cups→ml conversion | Causes this bug |
| Post-hoc LLM rewrite | Extra latency |

## Scope of Change

- `system-prompt.ts`, `definitions.ts`, `execute.ts` (+ test)

## Rollback Plan

Revert prompt + default behavior.

## Risk Assessment

Low–medium: stricter schema may increase HITL retries until model complies.

## Regression Test Plan

Assert ingredientInputsFromArgs preserves `cup` / `tbsp`; does not rewrite to ml.
