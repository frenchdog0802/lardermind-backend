# Feature: Cloudflare chat tools + HITL (`backend-cf/`)

**Status:** In progress  
**Scope:** Light tool-calling agent on Workers (no LangGraph) with HITL before mutating tools; `POST /api/chat/resume`; SSE `interrupt`  
**Out of scope:** Full LangGraph/checkpointer port; URL recipe scrape; organizePantry; Stripe

**User choice:** HITL **B** — mutating tools interrupt until approve/reject.

---

## 1. Summary

CF chat today is text-only DeepSeek stream. Clients already support interrupt banners + `chat/resume`. This feature adds OpenAI-compatible **tools**, a bounded agent loop, HITL gate for writes, and card-typed `done` / resume responses using existing D1 CRUD.

### Locked decisions

| Decision | Choice |
|----------|--------|
| Runtime | Custom loop (not LangGraph) |
| HITL | Mutating tools interrupt before execute (default on) |
| Resume | `POST /api/chat/resume` → JSON `{ success, data: ChatResponse }` (match clients) |
| Stream | `interrupt` is terminal (no `done`); approve/reject continues via resume |
| Quota | Charge on stream/send only; resume free |
| Pending state | `chat_sessions.pending_interrupt_json` + `locked_at` |
| Agent LLM calls | Non-stream completion for tool turns (reliability); final text may be chunked on SSE |
| v1 tools | See design (read-only + core mutating subset) |

---

## 2. Requirements

### 2.1 Stream

- Bind tools on chat completions.
- Read-only tools: auto-execute, loop (max N rounds).
- If any mutating tool in the batch: persist pending, SSE `interrupt` with `pendingTools`, end stream.
- Else finalize: SSE `token*` + `done` with `type`/`message`/`data` (cards when tools ran).

### 2.2 Resume

- Body: `{ sessionId, decision: 'approve'|'reject', note? }`.
- Approve: execute pending mutating tools → optional follow-up LLM text → return card/text response.
- Reject: skip mutating execution; LLM/text apology or note → text response.
- Clear pending + unlock session.
- No pending → 400/404.

### 2.3 `chat/send`

- Same agent turn as stream but JSON response (optional convenience); or keep 501 and document stream-only — **implement send as non-SSE same loop** for parity.

### 2.4 Actions

- `GET /api/chat/actions` returns implemented tool names.

---

## 3. Success criteria

- [ ] Mutating tool → SSE `interrupt` + UI can approve/reject
- [ ] Approve writes D1 + card-typed response; reject does not write
- [ ] Read-only tools work without interrupt
- [ ] Vitest for HITL gate, resume approve/reject, parser tool_calls
- [ ] README updated

---

## 4. References

- Design: `docs/design/backend-cf-chat-tools-design.md`
- Nest contract: `docs/features/chat-langgraph.md`, `docs/designs/chat-langgraph-design.md`
- Tasks: `tasks/backend-cf-chat-tools/`
