# Progress: web-agent-chat-ux

| Task | Status | Notes |
|------|--------|-------|
| 01 | done | en/zh greetingHi, chips, cards, placeholder |
| 02 | done | Single greeting; welcome helper removed |
| 03 | done | Composer elevation, 52px min, muted→herb send |
| 04 | done | 2×2 suggestedPromptCards |
| 05 | done | Header New chat vs session title |
| 06 | done | Pantry/Buy chips → Inventory/Shopping |
| 07 | done | Drawer New chat above Recents |
| 08 | done | MASTER.md Chat empty + composer |
| 09 | done | See sign-off |

## Sign-off

**2026-09-20** — Feature acceptance (§8):

### P0
- [x] Single primary greeting line
- [x] Composer distinct (border + shadow-sm); taller; send muted until ready
- [x] Product-specific placeholder (en + zh)

### P1
- [x] 2×2 short-label cards; full prompt on select
- [x] Header title New chat when empty; else session title / Chat fallback

### P2
- [x] Context chips → Inventory / Shopping
- [x] Drawer New chat above Recents; footer Settings + Subscription
- [x] Warm Kitchen only; streaming/HITL unchanged
- [x] Touched-path typecheck clean for ChatEmptyState / AICookingAssistant / AppDrawer
