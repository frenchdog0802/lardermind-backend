# Task 06: Chat SSE + Workers AI

**Phase:** 2 — AI chat  
**Depends on:** 05  
**Blocks:** 10–11

## Description

`POST /api/chat/stream` with SSE events `token`, `done`, `error` compatible with `frontend/src/api/chat.ts`.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/lib/sse.ts` |
| Create | `backend-cf/src/agent/system-prompt.ts` |
| Create | `backend-cf/src/agent/stream-chat.ts` |
| Extend | `backend-cf/src/routes/chat.ts` |

## Acceptance criteria

- [ ] Stream uses `env.AI.run` with `stream: true`
- [ ] Persists user + assistant messages to D1
- [ ] `done` payload `{ type:'text', message, data:{} }`
