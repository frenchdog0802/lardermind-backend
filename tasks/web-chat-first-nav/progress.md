# Progress: web-chat-first-nav

| Task | Status | Notes |
|------|--------|-------|
| 01 | done | en/zh nav + greetings |
| 02 | done | AppHeader + AppDrawer |
| 03 | done | Drawer shell; subscription view; no Sidebar/BottomNav |
| 04 | done | Full-height agent chat; session props; chips removed |
| 05 | done | ChatEmptyState + chatGreeting |
| 06 | done | Tool/Settings/Subscription headers |
| 07 | done | Home, AskAiEmptyCta, Sidebar, BottomNav deleted |
| 08 | done | MASTER.md chrome updated |
| 09 | done | `chatGreeting` node:test pass; touched files clean under tsc (pre-existing repo errors remain elsewhere) |
| 10 | done | See sign-off |

## Sign-off

**2026-09-16** — Feature acceptance (§8):

- [x] Login / post-auth lands on Chat; no Home in primary nav
- [x] No desktop Sidebar; no mobile BottomNav
- [x] Hamburger opens drawer: primary + Recents + footer (New chat, Settings, Subscription)
- [x] Recents / New chat wired via App → Chat props
- [x] Chat empty state greeting/tagline/counts; Home hub removed
- [x] Tool screens no Ask AI empty CTAs
- [x] Agent chat layout (sticky header/composer); Warm Kitchen unchanged
- [x] Guest landing / MarketingLanding unchanged
- [x] en + zh strings added
- [x] Touched-path typecheck clean; greeting unit tests pass

Manual smoke still recommended: login → drawer Recents/New chat → Inventory → Subscription checkout return.
