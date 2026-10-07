# Task 05: Web — consume `session_title`

**Phase:** 3 — Clients  
**Depends on:** 03

## Goal

Web Chat header and Recents reflect auto-titles without requiring a full page reload.

## Work

1. Find the chat SSE parser in `frontend` (stream consumer used by `AICookingAssistant`).
2. On `session_title`, update current session title in component state.
3. Ensure Recents updates: refresh `listSessions` after stream completes and/or patch if sessions are held higher up; minimum — refresh when drawer opens after the turn (verify); prefer live update if cheap.
4. Header must show the new title once state updates.

## Acceptance

- [ ] After first streamed reply, header leaves “New chat” for the generated title
- [ ] Recents shows the new title without full browser reload
- [ ] No regression on existing SSE events (`token`, `done`, `interrupt`, `error`)
