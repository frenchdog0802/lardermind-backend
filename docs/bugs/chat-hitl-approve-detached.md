# Bug: HITL Approve banner feels like a popup and false “reply interrupted”

**Status:** Resolved  
**Resolved by:** SSE interrupt marked terminal (web+mobile); Approve/Reject rendered inline on the interrupt message (web transcript + mobile `ChatMessageRow`); removed header-docked banner and mobile `Alert` popup  
**RCA:** `docs/rca/chat-hitl-approve-detached-rca.md`  
**Fix design:** `docs/fixes/chat-hitl-approve-detached-fix.md`  

---

## Current Behavior

When Chat needs approval for mutating tools (e.g. several `createRecipe` calls):

1. An **“Approve these changes?”** card appears pinned under the app header, **outside** the message scroll/thread — it reads like a popup, not the next turn in the conversation.
2. At the same time, the transcript often shows a system/error line: **“The reply was interrupted. Please try again.”** even though HITL interrupt is the expected terminal outcome of that stream.
3. Approve/Reject still work via the pinned banner, but the interrupt message in the thread is wrong/misleading.

## Expected Behavior

1. Approval UI is part of the **conversation flow** — visually the next assistant turn in the thread (same column as other assistant content), not a detached header-docked popup.
2. A successful HITL interrupt must **not** surface the “reply was interrupted” error.
3. Approve / Reject remain available until the user decides; after approve/reject the thread continues with the resume result.

## Reproduction Steps

1. Sign in to web Chat against `backend-cf` with chat tools / HITL enabled.
2. Drive a turn that requests mutating tools (e.g. ask to create several side-dish recipes so the model emits multiple `createRecipe` tool calls).
3. Observe: Approve card docks under the header; scroll area may show “The reply was interrupted. Please try again.”
4. Note that the Approve block is not sitting where the assistant’s interrupt turn would continue the message list.

## Environment

- App: web `frontend/` (`AICookingAssistant`)
- Also applies to mobile SSE consumer (`mobile/src/api/chat.ts`) for the false interrupt error
- API: `POST /api/chat/stream` → SSE `event: interrupt` (terminal; no `done`)

## Related Files

- `frontend/src/components/AICookingAssistant.tsx` — `pendingApproval` banner above transcript
- `frontend/src/api/chat.ts` — `consumeSseStream` terminal-event tracking
- `mobile/src/api/chat.ts` — same SSE consumer pattern
- `mobile/src/screens/AICookingAssistantScreen.tsx` — Approve banner placement
- `backend-cf/src/agent/stream-chat.ts` / `agent-loop.ts` — interrupt is intentional terminal SSE

## Impact Scope

- HITL UX trust: users think the reply failed while approval is still pending.
- Approve feels disconnected from the turn that requested it.
- Does not by itself prevent D1 writes after Approve (separate from recipe card emptiness).

## Reproducibility Notes

- Screenshot: Approve list of `createRecipe — …` under header + bottom error “The reply was interrupted…”.
- Feature contract already says stream interrupt is terminal (no `done`).

## Related Documents

- `docs/features/backend-cf-chat-tools.md`
- `docs/design/backend-cf-chat-tools-design.md`
