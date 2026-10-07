# RCA: HITL Approve banner detached + false “reply interrupted”

**Bug:** `docs/bugs/chat-hitl-approve-detached.md`  
**Status:** Confirmed via code inspection + screenshot  

---

## Root Cause

Two stacked client issues:

### A. Approve UI is mounted outside the message list

In `AICookingAssistant.tsx`, HITL state lives in `pendingApproval` and renders a banner **between `AppHeader` and the scrollable transcript**, not as content of the assistant `interrupt` message already written into `messages`.

So even when the stream correctly ends with SSE `interrupt`, the Approve/Reject controls are not “the next bubble in the conversation”; they float as a header-docked panel (popup-like).

Mobile uses the same pattern (`pendingApproval` block above the thread).

### B. SSE `interrupt` is not treated as a terminal event

In `frontend/src/api/chat.ts` (and `mobile/src/api/chat.ts`) `consumeSseStream`:

- `onDone` / `onError` set `receivedTerminalEvent = true`
- `onInterrupt` is forwarded **without** marking the stream terminal

Feature contract: mutating interrupt is **terminal** (SSE `interrupt`, no `done`). When the connection closes after interrupt, the `finally` block still runs:

```ts
if (!receivedTerminalEvent && !signal?.aborted) {
  handlers.onError('The reply was interrupted. Please try again.');
}
```

That false `onError` overwrites/settles the streaming assistant turn as `type: 'error'` while `pendingApproval` remains set — matching the screenshot (Approve banner + “The reply was interrupted…”).

## Contributing Factors

1. Interrupt message content is set in `onInterrupt`, then often replaced by the spurious `onError` settle.
2. Design docs describe “interrupt banners” historically; sticky placement was never reconciled with “continue the conversation” UX.
3. No client test asserting that an `interrupt` event alone leaves the stream without calling `onError`.

## Affected Components

| Component | Role |
|-----------|------|
| `frontend/src/api/chat.ts` | Misses terminal flag on interrupt |
| `mobile/src/api/chat.ts` | Same |
| `frontend/.../AICookingAssistant.tsx` | Approve UI outside message stream |
| `mobile/.../AICookingAssistantScreen.tsx` | Same pattern |
| `backend-cf` stream | Correctly emits terminal `interrupt` (not the bug) |

## Data / State Impact

No D1 corruption from this path alone. Pending interrupt JSON remains until approve/reject. Chat history may store a confusing error/interrupt message for that turn.

## Timeline

Introduced with CF chat tools + HITL client wiring (`docs/features/backend-cf-chat-tools.md`). The terminal-event guard was meant for dropped streams; interrupt was never included in the “terminal” set.

## Why it wasn't caught earlier

- Manual HITL tests focus on Approve writing data; the error banner is easy to ignore when Approve still works.
- Unit coverage for SSE consumer likely doesn’t assert “interrupt-only stream ⇒ no onError”.

## Plausible alternatives (ranked)

1. **Confirmed:** Interrupt not marked terminal → false error; Approve rendered outside thread → popup feel.
2. Unlikely: Backend also sends `error` after interrupt — design and stream-chat treat interrupt as end; screenshot text matches the client hard-coded string exactly.
3. Unlikely: User aborted the fetch — would throw AbortError path; message text is the non-abort finally branch.
