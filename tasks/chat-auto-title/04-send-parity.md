# Task 04: `/api/chat/send` optional title field

**Phase:** 2 — Wire chat  
**Depends on:** 01, 02

## Goal

Non-stream send path gets the same auto-title behavior.

## Work

1. After accepted `runAgentTurn` / equivalent on `POST /api/chat/send`, call `maybeAutoTitleSession`.
2. Include `title` on the success payload when persisted (follow existing `ok` envelope shape).
3. Do not change error/busy/quota envelopes beyond omitting title.

## Acceptance

- [ ] First message on new session returns a non-default `title` when generation/fallback works
- [ ] Custom-titled session does not get a new title field overwrite
