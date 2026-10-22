# Fix design: HITL approval runs once

**Bug:** `docs/bugs/hitl-double-execution.md`  
**RCA:** `docs/rca/hitl-double-execution-rca.md`

---

## Fix approach

Make resume a single-winner claim, then persist tool results and drop the pending payload **before** generating the reply.

1. **`interruptId`** — new pending rows store `interruptId` (UUID) and `expiresAt` (`createdAt + 20 minutes`). Older rows synthesize `legacy:<createdAt>:<firstToolCallId>`. The id is added to the interrupt payload and to history `pendingInterrupt` (additive).
2. **Resume body** — optional `interruptId`. Missing: operate on the current pending action (today's clients). Present and different from the pending id, or from the last completed checkpoint when nothing is pending: **409** `interrupt_mismatch`. Do not claim.
3. **Atomic claim** — `UPDATE chat_sessions SET pending_claim_token = ? WHERE pending_interrupt_json IS NOT NULL AND pending_claim_token IS NULL`. `changes = 0` means another worker owns it or it is already done.
4. **Checkpoint** — `hitl_checkpoint_json` stores phase `results_saved` (tool outputs, pending cleared, claim still held) then `complete` (HTTP status, response, claim released). A second resume with the same id (or with no id, when that checkpoint is the latest) returns the stored outcome and does not call `executeTool`.
5. **Reply failure** — if `finalizeText` throws, build a fallback from the stored tool results, mark `complete`, return that fallback. Tools are not run again.
6. **Expiry** — if `now >= expiresAt`, claim, skip mutating tools, store a rejection-style text response (`data.expired: true`), clear pending. A new chat turn also dismisses an expired pending action instead of staying busy forever.
7. **Args** — `validateToolArgs` walks the tool JSON schema in `COOKING_TOOLS`. Any failure: no writes, 400 `tool_args_invalid`, checkpoint stored so a retry does not execute.
8. **Targets** — `recheckMutatingTargets` re-reads pantry rows (update/remove), and recipes referenced by id (`addRecipeToMenu`, `planMeals`). A miss: no writes, 409 `target_missing`.
9. **Stale claim** — if the claim is older than 90 seconds and results are already saved, a later resume may finish the reply only. If the claim is stale and results were never saved, it closes the action with an error and does **not** execute tools (a crash mid-write must not run the batch again).

Why this over “check the lock boolean”: the lock is already held by the interrupt, and it is released on errors. A compare-and-set on `pending_claim_token` is the actual mutual exclusion. Clearing pending only after the LLM call is what makes retries re-enter `executeTool`.

## Alternatives considered

- **In-memory mutex** — useless across Workers isolates.
- **Idempotency inside each tool** — every mutating tool would need its own key, and reject/expiry would still be racy. Checkpoint is one place.
- **Require `interruptId`** — breaks current web and mobile clients. The field stays optional.

## Scope

- `db/chat.ts`, `agent/agent-loop.ts`, `routes/chat.ts`
- `agent/tools/validate-args.ts`, `agent/tools/recheck-targets.ts`
- Migration columns on `chat_sessions`: `pending_claim_token`, `hitl_checkpoint_json`
- Regression tests in `agent/hitl-resume.test.ts`
- History helper returns `interruptId` and `expiresAt`

No change to tool SQL beyond the approval-time existence check.

## Data migration

None. Existing pending JSON without `interruptId` keeps working via the legacy id. New columns are nullable.

## Rollback

Redeploy the previous Worker. New columns are ignored. A row left with `pending_claim_token` set and pending JSON still present would look “stuck” to the old code only if pending was not cleared; the new code clears pending when results are saved. Rolling back mid-claim can leave one token set; clearing `pending_claim_token` is safe if operations must unblock a session.

## Risks

- A Worker killed after some tool writes and before `results_saved` will not retry those tools. The user is told the approval was interrupted. That is the safe side of “at most once”.
- Replay returns the first HTTP outcome, including 400/409 validation failures.
- Expiry does not call the LLM.

## Regression tests

- Two overlapping approves → `executeTool` once; the later call is either the stored success or `resume_in_progress`; a following resume replays and still does not execute
- `finalizeText` throws → one execution, fallback text, second resume does not execute
- `createdAt` older than 20 minutes and `decision: approve` → zero executions, expired outcome, replay is stable
- `interruptId` mismatch → 409, zero executions, pending JSON unchanged
- Missing `items` on `addPantryItems` → 400, zero executions
- `updatePantryItems` whose `pantry_item_id` is gone → 409 `target_missing`, zero executions
