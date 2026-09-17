# Feature: Web Chat-First Navigation (AI-agent IA)

**Status:** Implemented  
**Scope:** Web authenticated app shell only (`frontend/`) — information architecture + navigation chrome + Chat empty state  
**Out of scope:** `landing/` marketing site, guest `MarketingLanding` / `DemoChatBox` restyle, mobile app, backend/session APIs (reuse Nest), Claude/ChatGPT/Gemini visual skin or dark theme, session rename/delete UI

**Precedent:** [mobile-chat-first-nav.md](./mobile-chat-first-nav.md) (mobile already shipped this IA; web was explicitly excluded)

**Design:** [web-chat-first-nav-design.md](../design/web-chat-first-nav-design.md)  
**Tasks:** [tasks/web-chat-first-nav/](../../tasks/web-chat-first-nav/)

---

## 1. Summary

Bring the **web authenticated app** to a **Claude / ChatGPT / Gemini–style agent interface**: Chat is the home surface; primary chrome is a **left drawer/panel** (hamburger) with destinations, **Recents**, and **+ New chat**; sticky bottom composer; Warm Kitchen tokens unchanged. Remove the desktop **Sidebar** + mobile **BottomNav** dual system and the **Home** hub (merge into Chat empty state). Align product behavior with mobile where locked below.

### Landing — does it matter?

**No for this feature.** `landing/` and guest `MarketingLanding` are pre-auth marketing. This change only reshapes the **logged-in** shell (`App.tsx` + tool/chat screens). Guest demo chat can stay as-is. If we later want marketing demo to *look* like the new agent UI, that is a separate feature.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature name | **`web-chat-first-nav`** | Confirmed |
| Platform | **Web (`frontend/`) only** | Mobile already done |
| Landing / guest marketing | **Out of scope** | Pre-auth; IA change is authenticated chrome |
| IA reference | **Claude / ChatGPT / Gemini–like agent pattern** | Chat-first, left history/nav panel, sticky composer — not a pixel clone of any one product |
| Theme | **Unchanged Warm Kitchen** | Agent IA only, not vendor skin |
| Entry | Authenticated default = **Chat (`aiAssistant`)** | Product is AI cooking assistant |
| Desktop Sidebar | **Removed** | Avoid dual nav; one agent chrome |
| Mobile BottomNav | **Removed** | Same as mobile feature |
| Top-right account avatar | **No** | Settings / Subscription in drawer |
| Home | **Delete / merge into Chat empty state** | Same as mobile |
| Tool → AI CTAs | **Remove** `AskAiEmptyCta` usages | Same as mobile; enter AI via Chat / drawer |
| Drawer primary | Chat · Calendar · Pantry/Inventory · Shopping · Recipes | Mirror mobile destinations |
| Drawer middle | **Recents** (Nest chat sessions) | Agent pattern; APIs exist |
| Drawer footer | **+ New chat** + Settings + **Subscription** | Confirmed include Subscription |
| Backend | **No new endpoints** | Reuse `chatApi` sessions on Nest |

### What changes

| Area | Before | After |
|------|--------|-------|
| Post-login screen | Chat default, but Home still in nav | Chat home; Home gone |
| Primary nav | Desktop Sidebar + mobile BottomNav | One left drawer/panel (all breakpoints) |
| AI entry | Home CTA + empty-state Ask AI + nav | Root Chat + drawer Recents / New chat |
| Home hub | `Home.tsx` | Deleted; greeting/tagline/stats → Chat empty |
| Session switch | Horizontal session chips on Chat | Drawer Recents (+ New chat); chips removed |
| Subscription entry | Mostly Settings / checkout query | Drawer footer item (plus existing Settings content as needed) |
| Landing / guest | MarketingLanding + DemoChatBox | **Unchanged** |

---

## 2. Current system

### 2.1 Shell

[`frontend/src/App.tsx`](../../frontend/src/App.tsx): view state (`currentView`), keep-alive for visited tabs. Guest: `landing` / `login` / `signup`. Authenticated chrome:

- Desktop: [`Sidebar.tsx`](../../frontend/src/components/Sidebar.tsx) (`lg+`)
- Mobile: [`BottomNav.tsx`](../../frontend/src/components/BottomNav.tsx) (`lg:hidden`, More sheet)

Default authenticated view is already `aiAssistant`, but Home remains a first-class destination.

### 2.2 Chat

[`AICookingAssistant.tsx`](../../frontend/src/components/AICookingAssistant.tsx): sessions via [`api/chat.ts`](../../frontend/src/api/chat.ts), horizontal session chips, New/Clear, card-wrapped transcript + composer, streaming + HITL approve.

### 2.3 Home / Ask AI CTAs

[`Home.tsx`](../../frontend/src/components/Home.tsx): hero, cook CTA → AI with prompt.  
[`AskAiEmptyCta.tsx`](../../frontend/src/components/AskAiEmptyCta.tsx) used from Calendar / Pantry / Shopping / Recipes empty states.

### 2.4 Subscription

Checkout return query (`?subscription=success|cancelled`) currently forces **Settings**. [`SubscriptionPanel`](../../frontend/src/components/SubscriptionPanel.tsx) lives under Settings. Mobile has a dedicated Subscription drawer route — web should expose Subscription from the drawer footer (exact screen vs Settings deep-link locked in design).

### 2.5 Guest / landing

[`MarketingLanding.tsx`](../../frontend/src/components/MarketingLanding.tsx) + optional static [`landing/`](../../landing/) — not part of authenticated nav. **No change in this feature.**

---

## 3. Requirements

### 3.1 Navigation / chrome

- Authenticated shell: **left drawer/panel** opened by hamburger (and closable overlay / Esc). Same IA at all breakpoints (agent pattern), not Sidebar + BottomNav split.
- Remove `Sidebar` and `BottomNav` from the authenticated shell (delete or stop mounting).
- Primary destinations: Chat, Calendar, Pantry (label may stay “Pantry” or match mobile “Inventory” — **design locks copy**), Shopping, Recipes.
- Every main screen header: **hamburger** opens drawer. Chat is not “backed out” to Home.
- Back from tool screens returns to **Chat** (or closes nested overlays only), not Home.

### 3.2 Drawer content (three layers)

1. **Primary:** destinations above.  
2. **Recents:** session titles from `listSessions`; tap → switch session, show Chat, close drawer.  
3. **Footer (sticky):** `+ New chat` → create/focus blank session + welcome empty state; **Settings**; **Subscription**.

### 3.3 Chat surface (agent UI)

- Full-height chat: sticky header + scrollable transcript + sticky composer (Claude/ChatGPT/Gemini-like), Warm Kitchen styling.
- Remove horizontal session chips (Recents live in drawer).
- Empty / new session: brand/tagline, personalized greeting, optional light pantry/shopping counts, suggested prompts — **no** Home shortcut grid, **no** required hero image.
- Keep streaming, markdown, action cards, HITL approve/reject behavior.

### 3.4 Remove Home + tool → AI CTAs

- Remove `Home` from nav and stop mounting as a primary view; delete or gut unused `Home.tsx` once unreferenced.
- Remove `AskAiEmptyCta` call sites from Calendar, Pantry, Shopping, Recipes (delete component if unused).

### 3.5 Subscription

- Drawer footer includes Subscription.
- Checkout return URL handling must still land the user on a subscription-relevant surface (Subscription view or Settings subscription section — design locks).

### 3.6 i18n / a11y

- Add/align strings with mobile where useful: `nav.openMenu`, `nav.recents`, `nav.newChat`, `nav.subscription`, empty Recents copy; keep **en + zh**.
- Hamburger, drawer, Recents, New chat have accessible names; focus trap / Esc close for drawer.

### 3.7 Auth lifecycle

- After logout / re-login, Recents must not show another user’s sessions (server-scoped JWT; refresh on drawer open / Chat bootstrap).

---

## 4. Edge cases

| Case | Expected |
|------|----------|
| Nest sessions empty | Recents empty; New chat works |
| `listSessions` fails | Soft fail; empty Recents; existing Chat still usable |
| Tap active Recents item | Close drawer; no reload thrash |
| New chat while streaming / HITL pending | Same guards as today’s New chat |
| Checkout `?subscription=` | Opens Subscription (or Settings sub-panel) without restoring Sidebar/BottomNav |
| Narrow mobile browser | Overlay drawer; composer respects safe-area |
| Wide desktop | Same IA; panel may be overlay or collapsible — **design locks** (must still feel agent-like, not old multi-app Sidebar) |
| Deep link / action card → Recipes etc. | Opens that view under new shell |

---

## 5. Security

| Risk | Mitigation |
|------|------------|
| Session list exposure | JWT-only; same as today |
| Cross-user Recents | Server-scoped; refresh after auth change |
| Focus / overlay | Esc + backdrop close; no new secrets |

---

## 6. UX issues

| Issue | Approach |
|-------|----------|
| Tools harder to find without bottom tabs | Clear primary list in drawer |
| Duplicate Recents (chips + drawer) | Chips removed |
| Users expect old Sidebar on desktop | Agent pattern is intentional; Warm Kitchen keeps brand |
| Empty tools lose Ask AI | Acceptable; enter via Chat |
| Subscription discoverability | Footer entry (locked) |

---

## 7. Performance

| Issue | Approach |
|-------|----------|
| Keep-alive of many views | Keep existing visited-view keep-alive **or** lazy-mount — design locks |
| Recents refresh | On drawer open + after New chat |
| Chat scroll | Avoid remounting Chat on tab switches so streams survive |

---

## 8. Acceptance criteria

- [x] Login / post-auth lands on Chat; no Home in primary nav.
- [x] No desktop Sidebar; no mobile BottomNav.
- [x] Hamburger opens drawer: primary + Recents + footer (New chat, Settings, Subscription).
- [x] Recents switches sessions; New chat creates/focuses blank session + empty state.
- [x] Chat empty state has greeting/tagline (optional counts); Home hub removed.
- [x] Tool screens do not navigate to AI via Ask AI empty CTAs.
- [x] Chat reads as agent UI (full-height transcript + sticky composer); Warm Kitchen tokens unchanged.
- [x] Guest landing / MarketingLanding unchanged.
- [x] en + zh strings for new nav copy.
- [x] Typecheck/lint for touched frontend paths pass.

---

## 9. Related files

| Path | Relevance |
|------|-----------|
| `frontend/src/App.tsx` | Shell: drawer, drop Sidebar/BottomNav/Home |
| `frontend/src/components/Sidebar.tsx` | Remove from shell |
| `frontend/src/components/BottomNav.tsx` | Remove from shell |
| `frontend/src/components/AICookingAssistant.tsx` | Agent layout, empty state, session hooks |
| `frontend/src/components/Home.tsx` | Delete / unmount |
| `frontend/src/components/AskAiEmptyCta.tsx` | Remove usages |
| `frontend/src/components/Calendar.tsx` / `PantryInventory.tsx` / `ShoppingList.tsx` / `RecipeManager.tsx` / `Settings.tsx` | Headers + CTAs |
| `frontend/src/components/SubscriptionPanel.tsx` | Drawer Subscription target |
| `frontend/src/api/chat.ts` | Sessions |
| `frontend/src/i18n/locales/en.json`, `zh.json` | Labels |
| `frontend/design-system/lardermind/MASTER.md` | Update “App chrome” pattern |
| `frontend/src/components/MarketingLanding.tsx`, `landing/` | **No change** |

---

## 10. Open items for design phase

1. Drawer implementation: overlay-only vs desktop collapsible persistent panel (still agent-like).  
2. Pantry label: “Pantry” vs “Inventory”.  
3. Subscription: dedicated view vs Settings deep-link + checkout return target.  
4. Session request ownership: App-level pending session/newChat props vs small context.  
5. Whether to extract shared `AppHeader` / `AppDrawer` / `ChatEmptyState` components.  
6. Keep-alive vs lazy mount policy under new shell.  
7. e2e / Playwright updates if any assume BottomNav/Sidebar.

---

## 11. Non-goals (this version)

- Restyling guest landing / DemoChatBox  
- Mobile changes  
- New backend session APIs  
- Session rename/delete  
- Claude/ChatGPT/Gemini dark theme or logo clone  
- Multimodal attach parity with mobile (separate feature)  
