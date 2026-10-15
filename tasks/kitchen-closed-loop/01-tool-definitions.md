# Task 01: Pantry update/remove tool definitions + HITL

**Phase:** 1  
**Goal:** Register mutating chat tools so the model can adjust or delete pantry items (HITL).

## Steps

1. In `backend-cf/src/agent/tools/definitions.ts`, add:
   - `updatePantryItems` — items with `name` / `pantry_item_id`, `quantity` and/or `delta`, optional `mode` (`set` | `delta`)
   - `removePantryItems` — items with `name` / `pantry_item_id`
2. Add both to `MUTATING_TOOLS` in `hitl.ts`; implement `argsSummary`.
3. Map both → `pantry_updated` in `cards.ts` / `TOOL_CARD_TYPES`.

## Acceptance

- [ ] `listToolNames()` includes both tools
- [ ] `isMutatingTool('updatePantryItems')` and `removePantryItems` are true
- [ ] HITL / card unit tests updated
- [ ] No executor behavior required yet beyond compile if tests mock execute
