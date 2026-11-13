# Fix: “no tool was started” on grocery-list asks

**Bug:** `docs/bugs/mutation-no-tool-false-positive.md`  
**RCA:** `docs/rca/mutation-no-tool-false-positive-rca.md`

## Fix approach

1. Tighten `looksLikeMutatingUserRequest`:
   - Keep explicit write-to-store patterns (add/save/update/remove … pantry|shopping list|recipe|calendar).
   - Do **not** flag draft/plan phrases: “make/generate a grocery list”, “what should I buy”, “grocery list of missing items”, “shopping list for the week” without add/save-to-my-list verbs aimed at persistence.
2. When mutation was flagged and nudge+required still yields no tools: if the model returned non-empty text, **use that text** instead of `MUTATION_NO_TOOL_FALLBACK` (soft path). Keep hard fallback only when content is empty.
3. Fail-first tests for grocery planning negatives + agent-loop soft fallback.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Remove mutation guard entirely | Reintroduces false “saved” claims |
| Always hard-fail | Current broken UX |

## Scope

- `mutating-intent.ts` + test
- `agent-loop.ts` (+ test if existing harness covers path)

## Rollback

Revert heuristic + fallback behavior.

## Regression plan

1. `looksLikeMutatingUserRequest('make a grocery list of missing items') === false`
2. Explicit `add eggs to my shopping list` still true
3. Soft fallback prefers model text when present
