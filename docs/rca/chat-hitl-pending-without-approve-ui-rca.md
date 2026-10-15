# RCA: Chat HITL pending blocks chat but Approve/Reject UI is missing

**Bug:** `docs/bugs/chat-hitl-pending-without-approve-ui.md`  
**Status:** Confirmed via screenshot + code inspection  

---

## Root Cause

Web Chat clears live HITL UI state when the user sends another message, while the server still holds the pending interrupt.

### A. Approve/Reject is gated only on in-memory `pendingApproval`

In `frontend/src/components/AICookingAssistant.tsx`, the transcript renders controls as:

```tsx
{message.type === 'interrupt' && pendingApproval && renderPendingApprovalCard()}
```

Interrupt messages in history alone are not enough. If `pendingApproval` is `null`, the user sees the approval text but no buttons.

### B. Sending a new message clears `pendingApproval` before the stream runs

At the start of `generateResponse`:

```ts
setPendingApproval(null);
```

If the user sends again while a HITL interrupt is open, the Approve card disappears immediately. The backend still has `pending_interrupt_json`, so `runAgentTurn` returns `kind: 'busy'` with:

> There is a pending action waiting for your approval. Approve or reject it first.

That error is shown as a system/error bubble. The user can no longer Approve/Reject from the UI → deadlock matching the screenshot.

### C. Web does not block send while approval is pending (mobile does)

Mobile already has:

```ts
const canSend = input.trim().length > 0 && !isTyping && !pendingApproval;
```

Web `ChatComposer` is only disabled for `isTyping`, so the clear-on-send path in (B) is reachable on web.

## Contributing Factors

1. Prior HITL UX fix (`chat-hitl-approve-detached`) moved Approve inline but still keyed buttons solely to ephemeral `pendingApproval`; its fix design explicitly accepted “history reload without live pendingApproval shows no buttons.”
2. `GET /api/chat/history` returns messages only — not session `pending_interrupt_json` — so refresh / session switch also drops Approve UI while D1 pending remains.
3. No client regression test that send-while-pending keeps Approve visible or blocks send.

## Affected Components

| Component | Role |
|-----------|------|
| `frontend/.../AICookingAssistant.tsx` | Clears `pendingApproval` on send; no send guard; Approve gated on state |
| `frontend/.../ChatComposer.tsx` | `disabled` only from parent (`isTyping`) |
| `mobile/.../AICookingAssistantScreen.tsx` | Already blocks send when pending (not the failure path) |
| `backend-cf/.../agent-loop.ts` | Correct busy guard when pending exists |
| `backend-cf/.../db/chat.ts` | Stores pending; not exposed on history |

## Data / State Impact

- D1: `pending_interrupt_json` remains until approve/reject (or manual clear).
- Client: UI state diverges from server → false “stuck with no actions.”
- No pantry/meal-plan writes occur for the blocked third request.

## Timeline

Introduced with HITL client wiring; worsened as a deadlock after Approve was moved fully onto `pendingApproval` (detached-banner fix), because clearing that state removes the only actionable UI.

## Why It Wasn't Caught Earlier

- Mobile send guard masks the same clear-on-send pattern.
- Happy-path tests approve before the next message.
- Screenshot repro requires a second mutating turn left pending, then another send on web.

## Confirmation Notes

Screenshot sequence matches (B)+(C): second turn shows interrupt copy without buttons after a further send; third turn is the busy pending message. Backend busy string is exact match to `agent-loop.ts`.
