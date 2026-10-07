# Bug: Chat claims pantry add succeeded but Kitchen Inventory stays empty

**Status:** Resolved  
**Resolved by:** Mutating-intent guard in agent loop (nudge + discard false success) + system-prompt hardening  
**RCA:** `docs/rca/chat-pantry-add-claimed-but-empty-rca.md`  
**Fix design:** `docs/fixes/chat-pantry-add-claimed-but-empty-fix.md`  

---

## Current Behavior

In Chat, the user asks to add items to inventory (e.g. 「幫我新增三份豬肉到庫存」). The assistant replies that the items **were added**, lists them under 「目前你的庫存」, and continues with follow-up questions. No Approve / Reject banner appears in the thread.

Opening **Kitchen Inventory** still shows **0 items** / **No items found**.

## Expected Behavior

For a request that changes pantry data:

1. The assistant must start a real write path (`addPantryItems` → HITL approve → D1 write), **or** clearly say nothing was saved yet.
2. After the user approves, Kitchen Inventory must show the new item(s).
3. The assistant must not claim 「已加入庫存」 (or equivalent) when nothing was persisted.

## Reproduction Steps

1. Sign in (web or mobile) against an API that has chat tools enabled.
2. Open Chat; ensure Kitchen Inventory is empty (or note current count).
3. Send: `幫我新增三份豬肉到庫存` (or equivalent “add X to pantry”).
4. Observe assistant text claiming the add succeeded and listing inventory in the message.
5. Open Kitchen Inventory (refresh / revisit if needed).
6. Observe: still **0 items** / **No items found**.

## Environment

- Chat: web `AICookingAssistant` (screenshot) and/or mobile chat
- Inventory: Kitchen Inventory screen (`PantryInventory` / mobile pantry screen)
- API: `backend-cf` chat agent (`POST /api/chat/stream`)
- Locale: Traditional Chinese user message; English UI labels on Inventory

## Related Files

- `backend-cf/src/agent/agent-loop.ts` — tool loop; text-only completions allowed
- `backend-cf/src/agent/system-prompt.ts` — tool-use instructions
- `backend-cf/src/agent/tools/definitions.ts` / `execute.ts` / `hitl.ts` — `addPantryItems` + HITL
- `frontend/src/components/AICookingAssistant.tsx` — interrupt banner + pantry refresh on `pantry_updated`
- `frontend/src/components/PantryInventory.tsx` — empty state

## Impact Scope

- Users believe pantry was updated when it was not (data integrity / trust).
- Blocks chat-driven inventory logging until they discover Inventory is empty.
- Same class of risk for other mutating tools if the model skips tool calls.

## Reproducibility Notes

- Screenshot pair: chat success copy vs Inventory empty state.
- Thread shows no 「Approve these changes?」 interrupt UI before the success reply.

## Related Documents

- `docs/features/backend-cf-chat-tools.md`
- `docs/design/backend-cf-chat-tools-design.md`
- `docs/bugs/inventory-add-fails.md` (resolved; different path: missing pantry CRUD routes)
