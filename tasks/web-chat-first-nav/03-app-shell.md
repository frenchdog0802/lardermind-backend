# 03 — App shell rewire

## Goal

Replace Sidebar/BottomNav with drawer shell; add subscription view; session request state.

## Acceptance

- [ ] No Sidebar/BottomNav mounted when authenticated
- [ ] `drawerOpen` + `AppDrawer` wired
- [ ] Views: drop `home`; add `subscription`
- [ ] Checkout query opens `subscription`
- [ ] `pendingSessionId` / `requestNewChat` passed to Chat
- [ ] Keep-alive retained for Chat + tools + settings + subscription
