# 04 — Chat agent layout + sessions

## Goal

Full-height agent chat UI; honor drawer session requests; remove session chips.

## Acceptance

- [ ] Sticky header (menu + title + new chat) + scroll transcript + sticky composer
- [ ] No horizontal session chips
- [ ] Handles `requestedSessionId` / `requestNewChat` and consumes flags
- [ ] Streaming / cards / HITL unchanged in behavior
- [ ] `onBack` removed; uses `onOpenMenu`
