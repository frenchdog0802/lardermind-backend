# Task 05: Chat sessions + history

**Phase:** 2 — AI chat  
**Depends on:** 04  
**Blocks:** 06

## Description

D1-backed chat sessions CRUD + history list matching Nest shapes used by web/mobile.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/db/chat.ts` |
| Extend | `backend-cf/src/routes/chat.ts` |

## Acceptance criteria

- [ ] `GET/POST /api/chat/sessions`, `PATCH/DELETE /api/chat/sessions/:id`
- [ ] `GET /api/chat/history?sessionId=`
