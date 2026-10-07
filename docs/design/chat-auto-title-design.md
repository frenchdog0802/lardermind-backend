# Technical Design: Chat Auto Title

**Feature reference:** [chat-auto-title.md](../features/chat-auto-title.md)  
**Status:** Implemented  
**Scope:** `backend-cf` title generation + SSE/API surface; `frontend` + `mobile` consume title updates  
**Out of scope:** Manual rename UI; schema change for `title_locked`; quota metering for titles

---

## 1. Architecture Overview

### 1.1 Where it fits

```mermaid
sequenceDiagram
  participant Client
  participant ChatRoute as chat routes
  participant Agent as runAgentTurn
  participant Title as autoTitle
  participant LLM as completeChat
  participant DB as D1 chat_sessions

  Client->>ChatRoute: POST /api/chat/stream
  ChatRoute->>Agent: runAgentTurn (persist user msg + reply)
  Agent-->>ChatRoute: turn result
  alt turn accepted and title still New chat
    ChatRoute->>Title: maybeAutoTitle(sessionId, userMessage)
    Title->>DB: read title
    Title->>LLM: short title completion
    LLM-->>Title: raw title
    Title->>DB: updateSessionTitle (if still New chat)
    ChatRoute-->>Client: SSE session_title
  end
  ChatRoute-->>Client: SSE token / done (unchanged)
```

Preferred ordering for stream UX:

1. Run agent turn as today (user message + assistant path).
2. **After** a successful accept of the user message path (success, interrupt, or completed reply — not busy/quota/error that rejected the turn), if session title is still `New chat`, generate + persist title.
3. Emit `session_title` **before** `done` when possible so UI can update while tokens already streamed — or immediately after tokens, still before stream close. Practical v1: generate title **after** `runAgentTurn` returns and **before** token chunking ends / before `done`. That adds title latency after the full agent turn.  

**Latency tradeoff (locked for v1):** Generate title **after** `runAgentTurn` completes (or returns interrupt), then emit `session_title`, then emit token chunks + `done` as today **or** emit tokens first then title then `done`.  

**Chosen v1:**  
- Stream tokens/`interrupt`/`error` exactly as today from the turn result.  
- Run title generation **in parallel with token chunking** when turn is success (message already known). For `interrupt`, run title before/while writing interrupt.  
- Emit `session_title` when ready (may arrive before or after some tokens). Always emit `done` last among success events.

If parallel is awkward in the current single async IIFE, **sequential after turn, before token loop** is acceptable for v1 (title delay = one small LLM call before first token). Prefer **before token loop** only if the title call is fast; otherwise parallel.

**Locked implementation preference:** After successful turn (including interrupt), **await** title attempt, emit `session_title` if updated, then proceed with existing token/`interrupt`/`done` emission. Simple and testable. Accept slight delay before first token once per new session.

### 1.2 Design decisions

| # | Topic | Decision | Rationale |
|---|--------|----------|-----------|
| 1 | Sentinel | Exact string `New chat` | Matches DB + createSession |
| 2 | Gate | `getSessionForUser` → title === `New chat` | No new column |
| 3 | Input | First user message text of this turn (already in request) | Enough for ChatGPT-style naming |
| 4 | LLM | `completeChat` with system+user title prompt; no tools; optional `max_tokens` (~24) | Reuse gateway |
| 5 | Fallback | `fallbackTitleFromMessage(message)` | Resilience |
| 6 | Persist | `updateSessionTitle` only if still sentinel (re-check or conditional UPDATE) | Race-safe vs manual rename |
| 7 | SSE | New event `session_title` → `{"sessionId","title"}` | Clients update without full list |
| 8 | `/send` | Add optional `title` on success JSON when changed | Parity |
| 9 | Quota | Do not call daily AI quota helpers for title | Feature requirement |
| 10 | Clients | On `session_title`: patch local session state + header; drawer refreshes on open (already) and may patch if list held in memory | Minimal UI |

### 1.3 Module layout

| Module | Role |
|--------|------|
| `backend-cf/src/agent/auto-title.ts` (new) | Prompt, sanitize, fallback, `maybeAutoTitleSession(...)` |
| `backend-cf/src/lib/llm-chat.ts` | Optional `maxTokens` on `completeChat` |
| `backend-cf/src/db/chat.ts` | Optional `updateSessionTitleIfDefault(...)` conditional UPDATE |
| `backend-cf/src/agent/stream-chat.ts` | Call maybe-auto-title; emit SSE |
| `backend-cf/src/routes/chat.ts` | `/send` parity |
| `frontend` stream consumer + session state | Handle `session_title` |
| `mobile` stream consumer + session state | Handle `session_title` |

---

## 2. Data Models / Schema

No migration. Reuse:

```sql
chat_sessions.title TEXT NOT NULL DEFAULT 'New chat'
```

### 2.1 Constants

```ts
export const DEFAULT_CHAT_TITLE = 'New chat';
export const AUTO_TITLE_MAX_CHARS = 60;
export const AUTO_TITLE_INPUT_MAX_CHARS = 500;
```

### 2.2 Conditional update (recommended)

```sql
UPDATE chat_sessions
SET title = ?, updated_at = ?
WHERE id = ? AND user_id = ? AND title = 'New chat'
```

Return whether a row was updated. Avoids overwriting a rename that happened mid-flight.

---

## 3. Interface Design

### 3.1 `maybeAutoTitleSession`

```ts
async function maybeAutoTitleSession(input: {
  env: Env;
  db: D1Database;
  userId: string;
  sessionId: string;
  userMessage: string;
}): Promise<{ title: string } | null>
```

Returns `{ title }` when persisted; `null` if skipped or failed entirely (including empty fallback).

Steps:

1. Trim `userMessage`; if empty → `null`.
2. Load session; if missing or `title !== DEFAULT_CHAT_TITLE` → `null`.
3. Try LLM title; on failure use fallback.
4. Sanitize; if empty → `null`.
5. Conditional UPDATE; if no row changed → `null`.
6. Return `{ title: sanitized }`.

### 3.2 Title prompt (sketch)

System: You name chat threads. Reply with ONLY a short title (3–8 words). No quotes, no punctuation spam, no emoji unless in the user text. Match the user’s language (zh/en).

User: first 500 chars of message.

### 3.3 Sanitize

- Trim; strip wrapping `"` / `'`.
- Take first line only.
- Collapse whitespace.
- Truncate to `AUTO_TITLE_MAX_CHARS` (prefer word boundary when easy).
- Reject if equal to `DEFAULT_CHAT_TITLE` after sanitize (use fallback instead).

### 3.4 Fallback

- Trim, collapse whitespace, strip newlines → single line.
- Truncate to ~48 chars with ellipsis if needed.
- If empty → skip.

### 3.5 SSE

```
event: session_title
data: {"sessionId":"<uuid>","title":"Pantry pasta ideas"}
```

### 3.6 `/api/chat/send` success body

Existing success payload gains optional:

```ts
title?: string  // present when auto-title persisted this turn
```

(Exact nesting follows current `ok(...)` envelope conventions.)

### 3.7 `completeChat` extension

```ts
maxTokens?: number
```

Pass through to OpenAI-compatible body as `max_tokens` when set.

---

## 4. Business Logic Flow

### 4.1 When to run

Run after `runAgentTurn` / `resumeAgentTurn` returns a kind that means the **user message was accepted into the session**:

| Turn kind | Auto-title? |
|-----------|-------------|
| `complete` (reply) | Yes |
| `interrupt` | Yes |
| `busy` | No |
| `quota` | No |
| `error` | No (message not reliably part of thread) |

**Locked:** gate on turn kinds `complete` and `interrupt` only (matches `AgentTurnResult` in `agent-loop.ts`).

Resume path: only auto-title if title still sentinel (rare for resume after first message). Harmless if skipped.

### 4.2 Client handling

**Web**

- Wherever SSE events from chat stream are parsed, on `session_title`:
  - Update `currentSession.title` if ids match.
  - Optionally bump an in-memory sessions list if AppDrawer state is lifted; else Recents already `listSessions` on drawer open — ensure drawer refresh after stream completes OR pass a callback to refresh sessions.
- Header already derives from `currentSession?.title` — updating session state is enough.

**Mobile**

- Same SSE handling in the cooking assistant screen stream parser.
- Drawer refreshes on focus/open — ensure post-stream refresh or event bus if list is stale while open.

Minimal acceptance: after first turn, reopening Recents shows the new title. Better: live update without reopen.

---

## 5. Edge Cases & Errors

| Case | Handling |
|------|----------|
| LLM timeout / 5xx | Fallback title |
| Gateway misconfigured | Fallback (do not fail turn) |
| Conditional UPDATE 0 rows | Return null; no SSE |
| Title equals sentinel after LLM | Fallback |
| Multilingual mix | Prompt asks to match dominant language |
| Tool-only / empty assistant | Still title from user message |

---

## 6. Performance & Security

- One extra small completion **once per session** (sentinel gate).
- Cap input 500 chars; `max_tokens` ~24.
- No tools; no pantry dumps in title prompt.
- Auth: same session ownership as chat routes.
- Do not increment chat daily quota counters in title path.

---

## 7. Testing Plan

| Test | Layer |
|------|-------|
| `sanitizeTitle` / `fallbackTitleFromMessage` cases | unit |
| `maybeAutoTitleSession` skips non-sentinel | unit with mocked DB/LLM |
| Conditional update does not overwrite custom title | unit / db mock |
| Stream emits `session_title` when titled | stream-chat test with mocks |
| Turn `busy`/`quota` does not title | stream/route test |

---

## 8. Rollout

1. Backend generate + SSE + `/send` field.  
2. Web consumer.  
3. Mobile consumer.  
4. Docs / feature status → Implemented when acceptance passes.

No feature flag required for v1 (behavior is additive and low risk).
