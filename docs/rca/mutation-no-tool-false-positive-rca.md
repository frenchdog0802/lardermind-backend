# RCA: “no tool was started” on grocery-list asks

**Bug:** `docs/bugs/mutation-no-tool-false-positive.md`  
**Status:** Confirmed via code inspection

## Root cause

`looksLikeMutatingUserRequest` treats many EN phrases that mention shopping/list + verbs like `create`/`add`/`save` as mutations. `runAgentTurn` then forces a tool nudge and `toolChoice: 'required'`. If the model still returns text only (common for **draft** grocery lists that should not write yet), the loop replaces the reply with `MUTATION_NO_TOOL_FALLBACK`.

## Contributing factors

- Heuristic has no exclusion for planning / “make a list” without explicit persist intent.
- Fallback always hard-fails after one nudge; never surfaces the model’s drafted text.

## Affected components

- `mutating-intent.ts`
- `agent-loop.ts` mutation branch (~247–288)

## Data / state impact

None saved (correct); UX falsely claims a failed write.

## Why not caught earlier

Heuristic tests only cover clear add/remove cases, not grocery planning negatives.
