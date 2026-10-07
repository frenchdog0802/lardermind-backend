# Feature: Chat Auto Title

**Status:** Implemented  
**Scope:** Backend (`backend-cf/`) auto-names sessions; Web (`frontend/`) + Mobile (`mobile/`) surface updated titles in Recents / Chat header  
**Out of scope:** Manual rename UI (API already exists); deleting sessions; changing default create label; semantic search over titles; admin bulk retitle

**Design:** [chat-auto-title-design.md](../design/chat-auto-title-design.md)  
**Tasks:** [tasks/chat-auto-title/](../../tasks/chat-auto-title/)

---

## 1. Summary

Chat Recents currently show many identical **New chat** rows because every session is created with that default title and never renamed.

Modern agent UIs (ChatGPT, Claude.ai, Cursor) keep “New chat” only until the first real turn, then replace it with a short, topic-like title generated from the first user message.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature name | **`chat-auto-title`** | Cross-client capability owned by chat backend |
| Trigger | **First user message** on a session whose title is still the default sentinel | Matches mainstream agents; avoids empty-session noise |
| Default sentinel | Stored title **`New chat`** (exact, case-sensitive) | Matches DB default + `createSession` today |
| Generator | **Lightweight LLM** via existing AI Gateway / `completeChat` | Better than first-line truncation; reuses infra |
| Fallback | If LLM fails → **truncate / clean first user message** (≤ ~48 chars) | Recents never stay blank or stuck on sentinel when there is content |
| Blocking | **Non-blocking for the user turn** — title work must not delay first tokens meaningfully | Stream UX first |
| Overwrite policy | Auto-title **only if** current title is still `New chat`; never overwrite a non-default title | Preserves future manual rename |
| Quota | Title generation **does not** consume the user’s daily AI chat quota | Infrastructure, not a billed turn |
| Clients | **Web + Mobile** both show the new title | Same API/SSE; both drawers list `session.title` |
| Manual rename UI | **Out of scope** for this feature | PATCH already exists; UI can come later |

---

## 2. Current system

### 2.1 Backend

- `chat_sessions.title` defaults to `'New chat'` (`migrations/0001_init.sql`).
- `createSession` uses `title?.trim() || 'New chat'`.
- Stream/send auto-create sessions with no custom title.
- `PATCH /api/chat/sessions/:id` → `updateSessionTitle` exists but is unused by product flows.
- Chat streaming SSE events today: `status`, `token`, `done`, `error`, `interrupt` — **no title event**.

### 2.2 Clients

- Web drawer Recents (`AppDrawer`) and Chat header show `session.title` (or i18n “New chat” when empty).
- Mobile drawer Recents same pattern.
- Web has `chatApi.renameSession`; nothing calls it. Mobile has no rename helper yet (optional for this feature if only SSE/list refresh is used).

### 2.3 Pain

Multiple Recents rows all labeled **New chat** — users cannot tell threads apart.

---

## 3. Requirements

1. After the first accepted agent turn (`complete` or `interrupt`) on a session titled `New chat`, the backend generates a short descriptive title and persists it.
2. Title quality bar:
   - Short (target ≤ 48 characters; hard max 60 after sanitize).
   - Topic / intent label, not a full sentence, not a question echo when avoidable.
   - No surrounding quotes; no leading/trailing whitespace; single line.
   - Prefer the user’s language when the first message is clearly zh or en.
3. Streaming path (`/api/chat/stream`): emit an SSE event (e.g. `session_title`) with `{ sessionId, title }` once the title is saved, so clients can update header + Recents without waiting for a full sessions refetch (refetch remains acceptable as backup).
4. Non-stream path (`/api/chat/send`): include the new `title` on the success payload when generated (or return session snapshot fields).
5. If title generation fails, apply fallback truncation and still persist (unless even fallback yields empty — then leave `New chat`).
6. Second and later messages must **not** re-auto-title if the title is no longer `New chat`.
7. Empty sessions (created but never messaged) remain **New chat**.
8. Title generation must not fail the chat turn: agent reply path continues even if title work errors.
9. Web + Mobile Recents / active Chat header reflect the new title after the first turn (via SSE and/or refresh).

---

## 4. Acceptance

1. Create a new chat, send one message → Recents row updates from **New chat** to a short descriptive title (or fallback snippet) before or shortly after the assistant finishes.
2. Send a second message in the same session → title does **not** change again via auto-title.
3. Manually `PATCH` a session to a custom title, then send a message → auto-title does **not** overwrite it.
4. LLM failure still produces a usable fallback title when the user message is non-empty.
5. Chat stream still works if title generation throws; user sees the assistant reply.
6. Web and Mobile both show the updated title in Recents after the turn (open drawer / refresh list).
7. Automated tests cover: sentinel gate, sanitize/fallback, “do not overwrite non-default”, and (unit) title-prompt helper.

---

## 5. Edge cases

| Case | Expected |
|------|----------|
| User message is only whitespace / emoji | Fallback may stay weak; if sanitize empty → keep `New chat` |
| Very long first message | Title still ≤ 60 chars |
| HITL interrupt on first turn | Still auto-title from the user message (content was sent) |
| Quota / busy / error on turn (message not accepted) | Do **not** auto-title |
| Concurrent double-send race | Both see sentinel; last write wins; still a non-sentinel title — acceptable |
| Session created with custom `POST` title | Never auto-overwrite |
| i18n UI “New chat” vs stored English sentinel | Storage remains English `New chat`; UI may translate only when displaying the sentinel if already localized — do not invent new sentinel strings in DB |

---

## 6. Security / privacy / performance

- Title prompt must use **only** the current session’s first user message text (no other users’ data).
- Cap input length fed to the title model (e.g. first 500 chars of user message).
- Keep generation cheap: low `max_tokens`, no tools, non-stream.
- Do not log full message content in title-failure paths beyond existing chat logging norms.
- Auth unchanged: only the session owner’s turn can retitle that session.

---

## 7. UX notes

- Header may briefly show **New chat** until the title event arrives — acceptable.
- Recents should not flicker between titles on every message.
- Do not add a “Generating title…” row in Recents for v1.

---

## 8. Open questions

None — decisions locked above. If product later wants manual rename UI or re-title-on-topic-shift, that is a separate feature.
