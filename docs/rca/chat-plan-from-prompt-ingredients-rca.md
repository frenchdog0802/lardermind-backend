# RCA: Plan-from-prompt / invent qty / conflicting pantries

**Bug:** `docs/bugs/chat-plan-from-prompt-ingredients.md`  
**Status:** Confirmed via code inspection

## Root cause

First-win paste orchestration always pushes **addPantryItems (HITL) before planning**, and stock-dependent paths lead with empty-pantry when `listPantry` is empty — even when the same user message already lists ingredients. The model then invents quantities to satisfy `addPantryItems`’s required `quantity`. When both a prompt list and a saved pantry exist, the model may refuse with “two pantries” instead of merging.

## Contributing factors

- `quantity` required on addPantryItems schema.
- Prompt lacks an explicit “ingredients in this message = ephemeral pantry for this turn” rule.
