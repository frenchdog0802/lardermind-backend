# Fix Design: Chat message timestamps not shown

**Bug:** `docs/bugs/chat-message-timestamp-visible.md`  
**RCA:** `docs/rca/chat-message-timestamp-visible-rca.md`  

---

## Fix Approach

1. **Web:** Remove the `<time>` block and `formatTimestamp` helper from `AICookingAssistant.tsx`. Drop `group` / hover opacity classes that existed only for timestamp reveal if unused afterward.
2. **Mobile:** Remove the timestamp `Text` under the bubble in `ChatMessageRow.tsx`.
3. **Docs:** Update `web-agent-chat-style` feature + design locked decision to “do not display timestamps.”
4. Keep message `timestamp` fields in state/API (ordering, hydration) — display-only removal.

## Alternatives Considered

| Option | Why rejected |
|--------|----------------|
| Keep hover-only timestamps | Contradicts product choice (never show) |
| Settings toggle for timestamps | Out of scope; no settings surface requested |
| Remove `timestamp` from message model | Breaks hydration / sort; unnecessary |

## Scope of Change

- `frontend/src/components/AICookingAssistant.tsx`
- `mobile/src/components/chat/ChatMessageRow.tsx`
- Regression source tests (web + mobile)
- `docs/features/web-agent-chat-style.md`, `docs/design/web-agent-chat-style-design.md`
- Bug status → Resolved after ship

## Data Migration / Backfill

None.

## Rollback Plan

Revert UI + test + doc edits; timestamps reappear as before.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Lose a11y time info | Acceptable; product wants no time |
| Orphan `group` classes | Remove if only used for timestamp hover |

## Regression Test Plan

1. **Unit (source assert):** Web source has no message `<time>` / `formatTimestamp`; mobile row has no `toLocaleTimeString` in the message row component.
2. **Manual:** Send a user message — bubble shows content only, no clock string.
