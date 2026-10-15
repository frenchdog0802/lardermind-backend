# Task 03: System prompt — pantry tools + soft-reserve contract

**Phase:** 1  
**Goal:** Stop “no delete tool” replies; teach soft reserve vs confirm deduct.

## Steps

1. Update `backend-cf/src/agent/system-prompt.ts` (and `buildCookingAssistantSystemPrompt` if needed):
   - Tools exist to add, **update/reduce**, and **remove** pantry items (HITL)
   - Scheduling / planning **soft-reserves** availability; it does **not** change on-hand quantity
   - **Confirm / 確認已煮** is when on-hand is deducted
   - Never claim a deduct happened from planning alone
   - Never suggest negative add as a workaround
2. Keep existing rules: no inventing pantry; mutating requires tools

## Acceptance

- [ ] Prompt text covers update/remove + reserve vs deduct
- [ ] No contradiction with calendar hub (confirm-only writes)
- [ ] Existing prompt tests still pass (update if asserted strings)
