# Task 06: Mobile — consume `session_title`

**Phase:** 3 — Clients  
**Depends on:** 03

## Goal

Mobile Recents / chat header show auto-titles like web.

## Work

1. Find mobile chat stream parser (`AICookingAssistantScreen` or shared hook).
2. Handle `session_title` → update current session title state.
3. Ensure drawer Recents refreshes (on focus/open after turn, or live patch).
4. Add `renameSession` client helper only if needed; not required if only SSE + list refresh.

## Acceptance

- [ ] First turn updates visible title in header and Recents (after reopen at minimum)
- [ ] Existing stream/error/interrupt handling unchanged
