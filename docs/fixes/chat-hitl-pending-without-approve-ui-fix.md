# Fix: Keep HITL Approve available until decide; block send while pending

**Bug:** `docs/bugs/chat-hitl-pending-without-approve-ui.md`  
**RCA:** `docs/rca/chat-hitl-pending-without-approve-ui-rca.md`  

---

## Fix Approach

1. **Web send guard (parity with mobile):** Disable composer send while `pendingApproval` is set (`disabled={isTyping \|\| Boolean(pendingApproval)}`). Do not start a new stream until Approve/Reject.
2. **Stop clearing pending on send start:** Remove `setPendingApproval(null)` from the start of `generateResponse`. Clear only on successful resume that does not re-interrupt, session switch, or new session. Defense in depth if send is somehow triggered.
3. **Restore pending from history:** Extend `GET /api/chat/history` to include optional `pendingInterrupt: { pendingTools }` (from `getPendingInterrupt`). On `loadHistoryForSession` / bootstrap, if present, `setPendingApproval({ sessionId, pendingTools })` so refresh / already-stuck sessions recover Approve UI.
4. **Persist interrupt assistant rows:** On `kind === 'interrupt'`, `insertMessage` with `responseType: 'interrupt'` so reload has a transcript row for the Approve card to attach to (today only the user message is stored).
5. **In-session recovery:** If stream `onError` is the pending-action busy message, re-fetch history and restore `pendingApproval` so a already-cleared UI recovers without a full page reload.

Why: Smallest change that (a) prevents the deadlock path and (b) recovers sessions where UI state already diverged from D1.

## Alternatives Considered

| Option | Why not default |
|--------|-----------------|
| Only block send; no history restore | Leaves refresh / already-stuck sessions deadlocked |
| Only restore on busy error (keep last tools in a ref) | Helps in-session; not after reload; more fragile |
| Auto-reject when user sends another message | Changes HITL contract; surprising data loss |
| Sticky header banner again | Regresses `chat-hitl-approve-detached` |

## Scope of Change

- `frontend/src/components/AICookingAssistant.tsx` — send disabled while pending; do not clear pending at stream start; restore from history; restore on pending busy error
- `frontend/src/api/chat.ts` (+ types) — history response includes optional `pendingInterrupt`
- `backend-cf/src/routes/chat.ts` + `db/chat.ts` — return pending tool summaries on history
- `backend-cf/src/agent/agent-loop.ts` — persist interrupt assistant message
- Fail-first tests: web source/guard tests; history pending DTO; interrupt message insert
- Mobile: restore pending from history for refresh parity (same history field; send guard already present)

Out of scope: redesign of Approve card copy; changing busy-message wording; meal-plan tool semantics.

## Data Migration / Backfill Needs

None. Existing `pending_interrupt_json` is sufficient.

## Rollback Plan

Revert client + history response field. Pending busy guard on server unchanged.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| User cannot send a clarifying message while pending | Intentional; same as mobile; Approve/Reject first |
| History payload grows with full toolCalls | Return **summaries only** (`pendingTools`), not full `messages` / args blobs |
| Interrupt message without `type: 'interrupt'` after restore | History already persists `response_type`; ensure interrupt turns store that type (existing path) |
| Double Approve cards if multiple interrupt rows | Same as today: one shared `pendingApproval` card per interrupt row; acceptable until prior interrupts are historical |

## Regression Test Plan

1. Fail-first: assert web does not clear pending at generateResponse start / composer disabled when pending (source or unit test in frontend nested repo).
2. Fail-first: `GET /api/chat/history` with pending session returns `pendingInterrupt.pendingTools`.
3. Manual web: mutating interrupt → Approve visible → send disabled → Approve → success → send enabled.
4. Manual: interrupt → refresh → Approve restored → Approve works.
5. Manual: interrupt → (if somehow) busy pending error → after fix, buttons still present or restored via reload.
6. Mobile: send still blocked while pending; refresh restore if wired.
