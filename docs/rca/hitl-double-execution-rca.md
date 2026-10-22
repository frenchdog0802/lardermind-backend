# RCA: HITL approval runs mutating tools twice

**Bug:** `docs/bugs/hitl-double-execution.md`  
**Status:** Confirmed from current source

---

## Root cause

`resumeAgentTurn` (`backend-cf/src/agent/agent-loop.ts`) treats the pending JSON as still actionable for the whole function, and it only clears that JSON after `finalizeText` and `insertMessage` succeed.

The session lock does not close the race:

```ts
await tryAcquireSessionLock(db, input.userId, input.sessionId);
```

The boolean result is discarded. The interrupt path already sets `locked_at`, so a second resume often fails the lock predicate (`locked_at IS NULL OR locked_at < stale`) and continues anyway. Two callers can both read `pending_interrupt_json`, both call `appendToolResults` → `executeTool`, and both clear the row later.

`clearPendingInterrupt` runs only after the reply is persisted. The `catch` path calls `releaseSessionLock` and returns an error, leaving `pending_interrupt_json` in place. The next approve executes the tools again.

## Contributing factors

- `createdAt` is stored on the pending payload and never compared to a TTL, so a stale approval stays runnable.
- Resume has no action id, so a delayed client cannot tell a new pending action from the one it meant to approve.
- Tool arguments and target rows are not checked again at approve time; execution trusts the JSON captured when the model asked.

## Affected components

- `resumeAgentTurn` and `appendToolResults`
- `tryAcquireSessionLock`, `clearPendingInterrupt`, `getPendingInterrupt` in `db/chat.ts`
- `POST /api/chat/resume`
- Mutating tool executors (pantry, shopping list, recipes, meal plans, preferences) — they run once per successful `executeTool` call

## Data / state impact

Duplicate domain writes for one approval. Chat history can also gain two assistant replies if both callers finish `finalizeText`. A failed reply leaves the pending action armed.

## Timeline

Introduced with HITL persistence in migration `0005_chat_hitl.sql` and `resumeAgentTurn`. The lock was added as a busy flag for new turns, not as a claim on resume.

## Why it was not caught

Resume tests cover a single approve and a single reject on a mock that does not simulate two overlapping callers, and they do not fail the completion step. Nothing asserted “executor called once” under concurrency or after a thrown reply.
