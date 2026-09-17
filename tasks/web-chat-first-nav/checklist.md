# Checklist: web-chat-first-nav

## Phase 1 — Chrome

- [x] **01** — i18n en/zh nav + greeting keys
- [x] **02** — Add `AppHeader` + `AppDrawer`
- [x] **03** — Rewire `App.tsx` shell (drawer, drop Sidebar/BottomNav, subscription view)

## Phase 2 — Chat UX

- [x] **04** — Chat agent layout + `requestedSessionId` / `requestNewChat`; remove session chips
- [x] **05** — `ChatEmptyState` + `chatGreeting` helper

## Phase 3 — Cleanup

- [x] **06** — Wire hamburger headers on tool / Settings / Subscription screens
- [x] **07** — Delete Home; remove AskAiEmptyCta; delete Sidebar/BottomNav if unused
- [x] **08** — Update design-system MASTER app chrome

## Phase 4 — Verify

- [x] **09** — Unit test greeting + `tsc` for touched frontend paths
- [x] **10** — Acceptance sign-off against feature criteria
