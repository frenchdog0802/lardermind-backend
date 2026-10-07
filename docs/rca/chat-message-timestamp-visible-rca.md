# RCA: Chat messages show timestamps

**Bug:** `docs/bugs/chat-message-timestamp-visible.md`  
**Status:** Confirmed via code inspection + screenshot  

---

## Root Cause

Both chat UIs **intentionally render** a formatted clock time from each message’s `timestamp` field:

1. **Web** — `AICookingAssistant.tsx` renders a `<time>` element with `formatTimestamp(...)` inside the message container (hover/focus opacity reveal).
2. **Mobile** — `ChatMessageRow.tsx` always renders `toLocaleTimeString` under the bubble.

Product intent is now **no visible time**. The UI still ships the previous “show time” contract from `web-agent-chat-style` (hover) and mobile’s always-on label.

## Contributing Factors

1. Style feature locked “hidden by default; show on hover” — still a visible time path.
2. Touch / sticky hover can make web times appear without an intentional hover.
3. Mobile never adopted the hover-only pattern; always shows time.

## Affected Components

| Component | Role |
|-----------|------|
| `frontend/src/components/AICookingAssistant.tsx` | `<time>` + `formatTimestamp` |
| `mobile/src/components/chat/ChatMessageRow.tsx` | Always-on time `Text` |
| `docs/features/web-agent-chat-style.md` / design | Prior locked decision |

## Data / State Impact

None. Keep storing `timestamp` / `createdAt` for ordering and API; stop rendering only.

## Timeline

Web hover timestamps introduced with `web-agent-chat-style`. Mobile had always-on time earlier.

## Why it wasn't caught earlier

Prior acceptance criteria required timestamps on hover; product preference has since changed to never show them.
