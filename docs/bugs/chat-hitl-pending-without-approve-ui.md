# Bug: Chat HITL pending blocks chat but Approve/Reject UI is missing

**Status:** Resolved  
**Resolved by:** Web blocks send while HITL pending; stop clearing `pendingApproval` on stream start; history returns `pendingInterrupt` + persist interrupt assistant rows; restore Approve UI from history / pending busy error (web + mobile)  
**RCA:** `docs/rca/chat-hitl-pending-without-approve-ui-rca.md`  
**Fix design:** `docs/fixes/chat-hitl-pending-without-approve-ui-fix.md`  

---

## Current Behavior

In web Chat, after a mutating turn that requires HITL approval:

1. The assistant transcript shows **“I need your approval before making these changes.”**
2. **No Approve / Reject controls** (and no tool-call summary card for the pending action) appear on that interrupt turn.
3. Further mutating requests are rejected with a system/status message: **“There is a pending action waiting for your approval. Approve or reject it first.”**
4. The user cannot clear the pending interrupt from the UI, so Chat is stuck until the session/pending state is cleared by some other means.

Observed sequence (screenshot):

1. First meal-plan request (`宮保雞丁`) completed (approval text + later success / “Open Calendar” card).
2. Second meal-plan request (`酸菜雞肉`) showed approval text only — **no Approve/Reject**.
3. Pantry add request (`新增10包排骨…`) was blocked by the pending-action message.

## Expected Behavior

1. When the stream ends in a HITL interrupt, the transcript must show Approve / Reject (and the pending tool summary) for that turn.
2. Until the user decides, further mutating turns may stay blocked — but only while a **visible, actionable** approval UI exists.
3. After Approve or Reject, pending state clears and the next user message can proceed normally.

## Reproduction Steps

1. Sign in to web Chat against `backend-cf` with chat tools / HITL enabled.
2. Ask to schedule a dish today (e.g. `幫我今天新增一道宮保雞丁`) and complete approval if shown; confirm the meal appears / success card shows.
3. Ask to schedule another dish today (e.g. `幫我今天新增一道酸菜雞肉`).
4. Observe: assistant says approval is required, but Approve/Reject is missing.
5. Ask a different mutating action (e.g. add pantry items).
6. Observe: blocked with “There is a pending action waiting for your approval…”

## Environment

- App: web `frontend/` chat UI
- API: `backend-cf` — `POST /api/chat/stream` SSE `event: interrupt`; pending stored on chat session; subsequent turns check pending interrupt
- Date context in repro: 2026-10-15
- Locale: user messages Traditional Chinese; system HITL strings English

## Related Files

- `backend-cf/src/agent/agent-loop.ts` — interrupt message + “pending action waiting…” guard
- `backend-cf/src/agent/stream-chat.ts` — SSE `interrupt` emission
- `backend-cf/src/routes/chat.ts` — stream / resume approve|reject
- `backend-cf/src/db/chat.ts` — `pending_interrupt_json`
- `frontend/src/components/AICookingAssistant.tsx` — chat transcript + approval UI (nested frontend repo)
- `frontend/src/api/chat.ts` — SSE consume / interrupt handling

## Bug type (preliminary classification)

- Integration / UI state: backend pending interrupt vs client rendering of approval controls  
- Possible race or second-interrupt handling after a prior approve — **root cause not confirmed**

## Impact Scope

- **Severity:** Critical (Chat mutating flows deadlocked; user cannot approve or continue)
- Affects any HITL mutating tool after a “stuck” interrupt (meal plan, pantry, shopping, recipes, preferences)
- First interrupt in a session may appear to work; failure observed on a subsequent interrupt in the same thread

## Reproducibility Notes

- Strong screenshot evidence of missing Approve/Reject while pending guard fires.
- May depend on consecutive meal-plan (`planMeals` / schedule) interrupts in one session; not yet confirmed on a fresh session single interrupt.
- Unclear whether mobile shares the same missing-UI failure mode.

## Additional Information Needed (optional)

- Whether Approve/Reject briefly flashed then disappeared on the second turn
- Browser console / network: was SSE `event: interrupt` received for the second turn, and with what payload?
- Fresh session: does a single interrupt already lack Approve/Reject, or only after a prior approve?

## Related Documents

- `docs/bugs/chat-hitl-approve-detached.md` (Resolved — related HITL UX; different symptoms)
- `docs/features/backend-cf-chat-tools.md` (if present)
- `docs/design/backend-cf-chat-tools-design.md` (if present)
- `docs/features/chat-meal-plan-to-calendar.md` / `docs/design/chat-meal-plan-to-calendar-design.md` (meal-plan tool context)
