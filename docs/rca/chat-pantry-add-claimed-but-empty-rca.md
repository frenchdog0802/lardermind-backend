# RCA: Chat claims pantry add succeeded but Kitchen Inventory stays empty

**Bug:** `docs/bugs/chat-pantry-add-claimed-but-empty.md`  
**Status:** Confirmed via code inspection + screenshot pair  

---

## Root Cause

The chat agent allows the LLM to return **assistant text with zero `tool_calls`**. For mutating requests (e.g. add to pantry), `tool_choice` is `'auto'`, so the model can invent a success reply (「已加入庫存」, fake inventory list) without calling `addPantryItems`.

When no mutating tool is requested:

- HITL interrupt never runs
- `mergeAddPantryItem` never writes D1
- Stream ends with SSE `token` + `done` `type: 'text'`
- Client never gets `pantry_updated`, so it does not refresh pantry

Kitchen Inventory correctly shows empty because nothing was persisted.

## Contributing Factors

1. System prompt says “use tools first” / “do not invent pantry items” but does not hard-block claiming a write without a tool in the same turn.
2. `runToolLoop` treats `toolCalls.length === 0` as a finished turn and forwards the model text as the user-visible answer.
3. UX makes hallucination look like success (bold item + ✅ + “current inventory” list), so users do not notice missing Approve banner.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/agent/agent-loop.ts` | Accepts text-only completion as final answer |
| `backend-cf/src/lib/llm-chat.ts` | `tool_choice: 'auto'` |
| `backend-cf/src/agent/system-prompt.ts` | Soft guidance only |
| `frontend/.../AICookingAssistant.tsx` | Interrupt + refresh only when tools/HITL fire |

## Data / State Impact

No corrupt D1 rows from this path — writes simply never happen. Chat history stores the false success message, which can confuse later turns.

## Timeline

Introduced with `backend-cf` chat tools + HITL (`docs/features/backend-cf-chat-tools.md`). Text-only streaming before tools could also invent adds; tools were meant to fix that but still depend on voluntary tool calls.

## Why it wasn't caught earlier

- Vitests mock models that already return `addPantryItems` / `listPantry`; no case for “mutation request → text-only false success”.
- Manual happy path likely approved HITL when the model behaved; hallucination is intermittent by provider/model.

## Plausible alternatives (ranked)

1. **Confirmed:** Model skipped tools; text claimed success; no D1 write — matches screenshot (success text, no Approve UI, Inventory empty).
2. Less likely: User approved, write failed, UI still showed success — would still typically show interrupt first; screenshot has no interrupt.
3. Unlikely: Write succeeded under another user/DB — Inventory empty for same session user contradicts this without evidence of dual backends.
4. Unlikely: Inventory UI cache only — refresh/`0 items` after revisit would still load from API; empty list means API returned none.
