# Task 02: DB conditional title update + LLM maxTokens

**Phase:** 1 — Backend core  
**Depends on:** none (can parallel with 01)

## Goal

Support race-safe title writes and cheap title completions.

## Work

1. Add `updateSessionTitleIfDefault(db, userId, sessionId, title)` in `db/chat.ts` using `WHERE title = 'New chat'`.
2. Return updated DTO or `null` if no row changed.
3. Extend `completeChat` with optional `maxTokens` → `max_tokens` in request body.
4. Unit test conditional update behavior with mocked D1 (or existing db test style).

## Acceptance

- [ ] Non-default title is not overwritten
- [ ] Default title updates and returns DTO
- [ ] `maxTokens` only sent when provided
