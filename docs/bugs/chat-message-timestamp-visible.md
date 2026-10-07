# Bug: Chat messages show timestamps

**Status:** Resolved  
**Resolved by:** Remove message `<time>` / `formatTimestamp` (web) and always-on time label (mobile); keep `timestamp` data for ordering only  
**RCA:** `docs/rca/chat-message-timestamp-visible-rca.md`  
**Fix design:** `docs/fixes/chat-message-timestamp-visible-fix.md`  

---

## Current Behavior

Each chat message shows a clock time (e.g. `02:22 AM`) under the message text. On web, the time lives inside the message row (hover/focus reveal). On mobile, the time is always visible under the bubble.

## Expected Behavior

Message rows show content only — **no timestamp** in the UI (not on hover, not always-on).

## Reproduction Steps

1. Open Chat (web `AICookingAssistant` or mobile chat).
2. Send a short message (e.g. `哈囉`).
3. Observe a time string under / inside the message bubble.

## Environment

- App: `frontend/` (web), `mobile/` (RN)
- Screen: chat transcript message rows

## Related Files

- `frontend/src/components/AICookingAssistant.tsx` — `<time>` + `formatTimestamp`
- `mobile/src/components/chat/ChatMessageRow.tsx` — `toLocaleTimeString` under bubble

## Impact Scope

- Cosmetic / UX: transcript clutter only.
- Does not affect message storage, API `createdAt`, streaming, or ordering.

## Reproducibility Notes

- Visual + code: timestamp markup is unconditional in both clients.

## Related Documents

- `docs/features/web-agent-chat-style.md` (locked decision previously: hover timestamps)
- `docs/design/web-agent-chat-style-design.md` (§ Timestamp)
