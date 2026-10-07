# Fix: Inline HITL Approve + treat SSE interrupt as terminal

**Bug:** `docs/bugs/chat-hitl-approve-detached.md`  
**RCA:** `docs/rca/chat-hitl-approve-detached-rca.md`  

---

## Fix Approach

1. **SSE:** In web and mobile `consumeSseStream`, wrap `onInterrupt` so it sets `receivedTerminalEvent = true` (same as `onDone` / `onError`). An interrupt-only stream must not call `onError('The reply was interrupted…')`.
2. **UI:** Render Approve/Reject **inside the transcript** on the assistant message that represents the interrupt (the settled streaming turn with `type: 'interrupt'`), using existing `pendingApproval` for session id + tool list / disabled state. Remove the header-docked banner so approval continues the conversation column.

Why: Smallest change that matches the feature contract (interrupt is terminal) and the user’s expectation (接續對話).

## Alternatives Considered

| Option | Why not default |
|--------|-----------------|
| Keep sticky banner; only fix SSE | Fixes false error but leaves popup feel |
| Modal dialog for Approve | More popup, not conversation-continuation |
| Backend also emit `done` after interrupt | Breaks documented contract; clients already special-case interrupt |

## Scope of Change

- `frontend/src/api/chat.ts` — terminal flag on interrupt; add/extend unit test if present
- `mobile/src/api/chat.ts` — same
- `frontend/src/components/AICookingAssistant.tsx` — inline Approve on interrupt message; remove top banner
- `mobile/src/screens/AICookingAssistantScreen.tsx` — same placement intent
- Fail-first test for SSE consumer: interrupt event ⇒ no `onError`

Out of scope: redesign of pending tool summary copy; recipe card field shape (`chat-recipe-created-card-empty`).

## Data Migration / Backfill Needs

None.

## Rollback Plan

Revert the client commits; sticky banner + previous SSE behavior return.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Interrupt message scrolled off-screen before user sees Approve | Keep Approve block sticky **within** the message row / immediately under interrupt content; optional `scrollIntoView` on interrupt settle |
| Duplicate Approve if both banner and inline left in | Delete banner entirely |
| History reload: interrupt messages without live `pendingApproval` | Only show buttons when `pendingApproval` is set for active session (same as today) |

## Regression Test Plan

1. Unit: SSE parse/consume — `event: interrupt` then end ⇒ `onInterrupt` called, `onError` not called.
2. Manual web: mutating tool → Approve appears in thread under that turn → no “reply was interrupted” → Approve writes → resume message appends.
3. Manual: Reject path still clears pending and appends reject acknowledgment.
