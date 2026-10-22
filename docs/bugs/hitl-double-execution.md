# Bug: Approving a chat action can run mutating tools twice

**Status:** Resolved  
**RCA:** `docs/rca/hitl-double-execution-rca.md`  
**Fix design:** `docs/fixes/hitl-double-execution-fix.md`

---

## Current behavior

`POST /api/chat/resume` with `decision: "approve"` can apply the same pending pantry/shopping/recipe/meal writes more than once.

Observed from the resume path:

- Two overlapping approves (double-click, or web and mobile together) both see `pending_interrupt_json` and both run the tools.
- If the follow-up reply (`finalizeText`) throws, the pending row is still there. The next resume runs the tools again.
- A pending action never expires. It stays approvable indefinitely.

## Expected behavior

- Each pending action's mutating tools run at most once.
- A repeat resume of the same action returns the original outcome and does not write again.
- Clients may send `interruptId`. A mismatch is HTTP 409 and does not run tools. Omitting `interruptId` still approves the current pending action.
- Pending actions older than 20 minutes are treated as rejected (tools do not run).
- Tool arguments are checked against the tool schema, and targeted rows are re-read, at approval time.
- Tool results are stored and the pending payload is cleared before the reply is generated. A reply failure still returns a fallback and does not re-run tools.

## Reproduction

1. Start a chat turn that interrupts on a mutating tool (`addPantryItems` or similar) so `chat_sessions.pending_interrupt_json` is set.
2. Send two `POST /api/chat/resume` requests with `{ sessionId, decision: "approve" }` at the same time.
3. Observe the tool executor runs twice (two pantry merges, two recipes, and so on).

Alternate: force the post-tool completion call to throw, then resume again. The tool runs a second time.

## Environment

- API: `backend-cf/` (Cloudflare Workers, Hono, D1)
- Routes: `POST /api/chat/resume`, and the agent loop that serves it
- Clients: web and mobile can both call resume for the same session

## Related files

- `backend-cf/src/agent/agent-loop.ts` — `resumeAgentTurn`
- `backend-cf/src/agent/tools/hitl.ts`
- `backend-cf/src/db/chat.ts` — lock and `pending_interrupt_json`
- `backend-cf/src/routes/chat.ts` — `POST /api/chat/resume`
- `backend-cf/migrations/0005_chat_hitl.sql`

## Impact

- Duplicate pantry quantities, shopping lines, recipes, or meal plans after one user approval
- Severity: **Critical** (data corruption on a normal retry)

## Classification

Race / logic. The pending row is the only gate, and it is cleared only after the reply succeeds. This is the bug itself, not a symptom of a different feature.

## Related documents

- `docs/features/backend-cf-chat-tools.md`
- `docs/design/backend-cf-chat-tools-design.md`
