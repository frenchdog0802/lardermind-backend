# Design: Web Setup Guide

**Feature:** [web-setup-guide.md](../features/web-setup-guide.md)

## 1. UI

- `fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))]`
- Hidden when `!md` (`useMediaQuery('(min-width: 768px)')`) or guest
- Card: `bg-surface border border-line rounded-2xl shadow-lg`
- Header: title + dismiss X (no Stripe Edit/expand for v1)
- Progress: thin bar `bg-sage` track, `bg-herb` fill
- Accordion rows; expanded row `bg-sage/30`
- Done sub-step: herb check circle; pending: `border-line` empty circle
- Locked: `Lock` icon, muted, no expand

## 2. Completion sources

| Step | Source |
|------|--------|
| pantry | `usePantry().pantryItems.length > 0` |
| recipes | `recipes.length > 0` |
| chat | `chatApi.listSessions()` → any session with non-empty `title` **or** `localStorage` flag set on first successful send (optional reinforcement) |
| meals | `mealPlan.length > 0` |
| shopping | `shoppingList.length > 0` |

Parent section complete when its primary criterion is true.

## 3. CTAs

| Step | Action |
|------|--------|
| pantry | `onNavigate('pantryInventory')` |
| recipes | `onNavigate('recipeManager')` |
| chat | `onNavigate('aiAssistant')` + optional `onAskAi(cook prompt)` |
| meals | Calendar CTA → `calendar`; AI CTA → Chat + plan prompt |
| shopping | `onNavigate('shoppingList')` |

## 4. Persistence

- `localStorage['lardermind.setupGuide.dismissed'] = '1'`
- Optional minimized state later; v1 dismiss only

## 5. Files

- `frontend/src/components/SetupGuide.tsx` (new)
- `frontend/src/App.tsx` (mount + navigate callbacks)
- `frontend/src/i18n/locales/en.json` + `zh.json`
- Optional: `frontend/src/utils/setupGuide.ts` for storage keys + completion helpers
