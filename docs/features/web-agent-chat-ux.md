# Feature: Web Agent Chat UX (empty state → composer polish)

**Status:** Implemented  
**Scope:** Web authenticated Chat surface (`frontend/`) — empty state, suggestion cards, composer chrome, Chat header title, drawer Recents / New chat micro-layout  
**Out of scope:** Mobile app, backend/API, guest `MarketingLanding` / `DemoChatBox`, Claude/ChatGPT dark skin, session rename/delete, multimodal attach / pantry-vision in web composer, desktop persistent sidebar (stay on overlay drawer)

**Precedent:** [web-chat-first-nav.md](./web-chat-first-nav.md) (IA already shipped; this is visual / empty-state / composer alignment)  
**Related (mobile, not in scope):** [mobile-chat-composer-redesign.md](./mobile-chat-composer-redesign.md)

**Design:** [web-agent-chat-ux-design.md](../design/web-agent-chat-ux-design.md)  
**Tasks:** [tasks/web-agent-chat-ux/](../../tasks/web-agent-chat-ux/)

---

## 1. Summary

`web-chat-first-nav` delivered the agent IA (drawer, Recents, sticky composer, Chat empty state). The logged-in Chat empty screen still reads as a sparse lifestyle landing: double greeting, muted pantry stats, tall vertical suggestion pills, thin composer, and a redundant header title always saying “Chat”.

Bring the **web Chat empty + composer + header + drawer chrome** in line with modern agent UIs (Claude / ChatGPT / Gemini patterns — not a pixel clone), while keeping **Warm Kitchen** tokens and brand serif for titles only.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Feature name | **`web-agent-chat-ux`** | Confirmed scope = agent Chat UX polish through P2 |
| Platform | **Web (`frontend/`) only** | Mobile has separate composer work |
| Theme | **Warm Kitchen unchanged** | Herb / linen / surface / sage / ink only |
| Drawer architecture | **Keep overlay drawer** (all breakpoints) | Do not reopen `web-chat-first-nav` persistent-panel decision |
| Attach / image in composer | **Out of scope** | No web chat pantry-vision attach today; separate feature |
| Suggestion model | **Short card label + full send prompt** | Cards scan like agent starters; send still uses actionable prompt |
| Context chips | **Clickable → Inventory / Shopping** | Reuse existing `onViewPantry` / `onViewShoppingList` |
| Header `+` New chat | **Keep** | Quick new chat without opening drawer (agent norm) |
| Header title | **Session-aware** | Empty / new → `New chat`; active → session title or fallback |
| P0–P2 scope | **All included in this feature** | User asked to plan through P2 |

### Priority map (product)

| Priority | Focus |
|----------|--------|
| **P0** | Empty-state density (single greeting); composer elevation / height / send idle vs ready |
| **P1** | Suggestions → 2×2 short cards; Chat header title = conversation name |
| **P2** | Pantry / Buy → clickable context chips; drawer Recents + New chat micro-layout |

### What changes

| Area | Before | After |
|------|--------|-------|
| Empty greeting | `Welcome back, Name` + period line + welcome sentence | One headline (`Hi, Name` or period greeting); welcome optional/demoted |
| Pantry / buy | Two muted text lines | Context chips; tap → Inventory / Shopping |
| Suggestions | Full-width vertical pills; long uneven copy | 2×2 grid of short-label cards; full prompt on select |
| Composer | Flat thin pill; send often looks “on” when disabled-ish | Elevated field; taller; muted send until `canSend`; product placeholder |
| Chat header title | Always `nav.aiChat` (“Chat”) | `New chat` when empty; else session title |
| Drawer footer | New chat button at bottom of footer stack | New chat moved above Recents (or under brand); Settings / Subscription stay bottom |

---

## 2. Current system

### 2.1 Empty state

[`ChatEmptyState.tsx`](../../frontend/src/components/ChatEmptyState.tsx):

- Headline from `home.welcomeBack` when named, else period greeting
- Second line: period greeting when named
- `ai.welcome` helper copy
- `home.pantryCount` / `home.buyCount` as plain text
- Suggestions: full-width `rounded-full` pills from `ai.suggestedPrompts` string array

### 2.2 Composer

[`AICookingAssistant.tsx`](../../frontend/src/components/AICookingAssistant.tsx) sticky footer:

- `rounded-[22px] border border-line bg-surface`
- Single-row-ish textarea (`min-h-[44px]`)
- Absolute send button: `bg-herb` when enabled, `disabled:bg-sage/60` when not
- Placeholder `ai.placeholder` = “Ask anything…”
- No attach control

### 2.3 Header / drawer

- [`AppHeader.tsx`](../../frontend/src/components/AppHeader.tsx): hamburger + title + optional `onNewChat` `+`
- Chat always passes `title={t('nav.aiChat')}`
- [`AppDrawer.tsx`](../../frontend/src/components/AppDrawer.tsx): primary nav → Recents → footer (`+ New chat`, Settings, Subscription)

### 2.4 i18n

`frontend/src/i18n/locales/en.json` + `zh.json`: `ai.suggestedPrompts` (full sentences), `ai.welcome`, `ai.placeholder`, `home.pantryCount` / `home.buyCount`.

---

## 3. Requirements

### 3.1 P0 — Empty state density + composer

1. Empty state shows **one** primary greeting line (named → short hi; unnamed → period greeting). Do **not** stack welcome-back + Good evening as two display lines.
2. Helper welcome sentence is optional; if kept, one muted line max; prefer removing when suggestions are present.
3. Empty-state cluster must feel tight (less vertical dead air between greeting → chips → suggestions). Composer stays sticky at bottom (no floating mid-page composer in v1).
4. Composer:
   - Clear contrast vs page (`bg-surface` field on linen chrome; readable border)
   - Soft elevation allowed (`shadow-sm` or equivalent token)
   - Comfortable typing height (target ~52–56px min; keep auto-grow / max height behavior)
   - Focus: herb-tint ring/border (existing focus-within may be strengthened)
   - Send: muted / ghost when `!canSend`; herb fill only when ready
5. Placeholder copy becomes product-specific (cooking / pantry / planning), en + zh.

### 3.2 P1 — Suggestion cards + header title

1. Replace vertical full-round pills with a **2×2** (or 2-column wrap) card grid on `sm+`; single column acceptable only on very narrow if needed — prefer always 2 columns from `xs` if readable.
2. Each card shows a **short label**; selecting sends / fills the **full prompt** (may equal label or be longer).
3. Card chrome: rounded rectangle (~12–16px), sage/linen surface, border-line, hover lift — **not** `rounded-full` pills.
4. Chat `AppHeader` title:
   - No messages (empty session) → `nav.newChat` / `ai.newChat` (“New chat”)
   - Has messages → `session.title` trimmed, else fallback `nav.aiChat`
5. Keep header hamburger + `+` New chat.

### 3.3 P2 — Context chips + drawer micro-layout

1. Replace pantry/buy paragraphs with **two chips** (e.g. `Pantry · N`, `Buy · N`).
2. Chip tap navigates to Inventory / Shopping via existing Chat callbacks (close empty-state interaction only; no new routes).
3. Chips are optional affordances — do not block typing or suggestions.
4. Drawer: move **`+ New chat`** out of the bottom footer cluster to a position **above Recents** (or directly under the brand row). Settings + Subscription remain sticky footer.
5. Recents empty copy stays one muted line; no large empty illustration.

### 3.4 i18n / a11y

- en + zh for all new/changed strings (greeting short form, chip labels, suggestion titles, placeholder, send aria if needed).
- Suggestion buttons and chips have accessible names.
- Send disabled state must not look strongly interactive.
- Respect `prefers-reduced-motion` for any hover/lift.

### 3.5 Non-regression

- Streaming, markdown, action cards, HITL approve/reject unchanged.
- Drawer Recents / New chat / session switch still work.
- Tool screens and guest landing unchanged.

---

## 4. Edge cases

| Case | Expected |
|------|----------|
| No display name | Single period greeting as headline |
| Pantry/shopping contexts loading / empty arrays | Chips show `0`; still tappable |
| Missing `onViewPantry` / `onViewShoppingList` | Chips hidden or non-interactive (design locks) |
| Suggestion i18n not array | Soft-fail: no suggestion grid (same as today) |
| Very long session title | Truncate in header (`truncate`) |
| Streaming / HITL | Composer disabled rules unchanged; New chat guards unchanged |
| Narrow mobile | 2-col cards if text fits; wrap label to 2 lines max with ellipsis |
| `selectedRecipe` overlay open | Composer hidden as today; empty polish N/A |

---

## 5. Security

| Risk | Mitigation |
|------|------------|
| Chip navigation | Client view switch only; same auth shell |
| Prompt injection via suggestion strings | Same as today — static i18n prompts |
| No new APIs | No new secrets / upload surface |

---

## 6. UX issues

| Issue | Approach |
|-------|----------|
| Feels like lifestyle landing not agent | Cut greeting stack; elevate composer; card grid |
| Long Import URL pill imbalance | Short labels on cards |
| Header “Chat” meaningless | Session-aware title |
| Dual New chat (header + drawer) | Intentional; drawer CTA repositioned for discoverability |
| Stats look like dead metadata | Make chips actionable |

---

## 7. Performance

| Issue | Approach |
|-------|----------|
| Empty state re-renders | Keep reading pantry context as today; no new polling |
| Suggestion structure change | Static i18n objects; no network |

---

## 8. Acceptance criteria

### P0

- [x] Empty state has a single primary greeting line (no stacked welcome-back + period as two headlines).
- [x] Composer is visually distinct (border + soft elevation); taller min height; send muted until ready.
- [x] Placeholder is product-specific (en + zh).

### P1

- [x] Suggestions render as short-label 2×2 cards; selecting uses full prompt.
- [x] Chat header title is `New chat` when empty, else session title (truncated fallback).

### P2

- [x] Pantry / Buy are tappable context chips → Inventory / Shopping.
- [x] Drawer `+ New chat` sits above Recents; Settings / Subscription stay footer.
- [x] Warm Kitchen tokens only; guest landing unchanged; streaming/HITL unchanged.
- [x] Typecheck/lint for touched frontend paths pass.

---

## 9. Related files

| Path | Relevance |
|------|-----------|
| `frontend/src/components/ChatEmptyState.tsx` | Greeting, chips, suggestion grid |
| `frontend/src/components/AICookingAssistant.tsx` | Composer, header title, wire chip navigation + suggestion select |
| `frontend/src/components/AppHeader.tsx` | May need no API change if title string only |
| `frontend/src/components/AppDrawer.tsx` | New chat position vs Recents |
| `frontend/src/i18n/locales/en.json`, `zh.json` | Copy / suggestion titles |
| `frontend/design-system/lardermind/MASTER.md` | Document Chat empty + composer pattern |
| `frontend/src/utils/chatGreeting.ts` | Keep period helper; may add short hi helper if needed |

---

## 10. Open items for design phase

1. Exact short greeting copy: `Hi, {{name}}` vs `Welcome, {{name}}` vs keep `home.welcomeBack` shortened.
2. Suggestion data shape: parallel `ai.suggestedPromptCards[{ title, prompt }]` vs derive titles separately.
3. Chip labels: `Pantry · N` vs icon + count only.
4. If `onViewPantry` / `onViewShoppingList` undefined: hide chips vs disable.
5. Whether empty-state vertical alignment stays `justify-center` or shifts slightly toward composer (`justify-end` with padding).

---

## 11. Non-goals (this version)

- Desktop persistent / collapsible panel  
- Web composer attach / pantry vision  
- Mobile parity implementation  
- Session rename / delete / search  
- Restyling tool screens (Calendar, Inventory, etc.)  
- Guest demo chat restyle  
- Dark mode / vendor skin clone  
