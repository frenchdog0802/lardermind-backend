# Bug: Chat empty-state pantry / buy chips show 0 after refresh or new chat

**Status:** Resolved  
**Resolved by:** Empty-state chips restore + mount fetch of pantry/shopping lists; count helpers in `chatEmptyChipCounts.ts`  
**RCA:** `docs/rca/web-chat-empty-chips-count-zero-rca.md`  
**Fix design:** `docs/fixes/web-chat-empty-chips-count-zero-fix.md`  

---

## Current Behavior

On the Chat empty / new-chat screen, the context chips show **食材庫 · 0** and **待購 · 0** even when Kitchen Inventory (and/or shopping list) already has items.

This appears after:

- Full page refresh (F5) while landing on Chat empty state, or
- Starting a **new conversation** (empty state again)

Opening Kitchen Inventory still shows the real stock — the data exists; the chips do not reflect it.

## Expected Behavior

When the empty state shows pantry / buy chips, counts must match the user’s current pantry size and unchecked shopping-list size (after a short load if needed), not stay stuck at 0 when stock exists.

## Reproduction Steps

1. Sign in on web Chat (`frontend/`).
2. Ensure Kitchen Inventory has at least one item (confirm on Inventory screen).
3. Return to Chat; if needed, start **New chat** so the empty state (greeting + chips + suggestion cards) is visible.
4. Observe chips: **食材庫 · 0** / **待購 · 0** (or English equivalents).
5. Optionally press F5 while still on that empty Chat view; chips remain 0.

## Environment

- App: `frontend/` (Vite / React)
- Screen: Chat empty state (`ChatEmptyState` inside `AICookingAssistant`)
- Locale: Traditional Chinese UI in reporter screenshot (`你好，{{name}}`, `食材庫 · {{count}}`, `待購 · {{count}}`)
- Browser: desktop web

## Related Files

- `frontend/src/components/ChatEmptyState.tsx` — empty UI / chips
- `frontend/src/components/AICookingAssistant.tsx` — empty stage + navigation props
- `frontend/src/contexts/pantryContext.tsx` — `pantryItems` / `shoppingList` source of counts
- `frontend/src/components/PantryInventory.tsx` / `ShoppingList.tsx` — screens that fetch lists on mount
- `docs/design/web-agent-chat-ux-design.md` — chip copy + navigation contract

## Impact Scope

- Misleading home context on Chat-first entry (default post-login view).
- Does not delete pantry data; Inventory screen remains correct once opened.
- Mobile empty state currently has no chips (web-reported).

## Reproducibility Notes

- Reporter: stock present, chips show 0 on refresh / new chat.
- Code inspection: default view is `aiAssistant`; pantry/shopping lists start as `[]` in context and are fetched from inventory/shopping screens (or after certain chat tool refreshes), not when only Chat empty state is shown.

## Related Documents

- `docs/design/web-agent-chat-ux-design.md` (§ context chips)
- `tasks/web-agent-chat-ux/06-context-chips.md`
- `docs/bugs/web-chat-f5-empty-flash.md` (related empty-state timing; different symptom)
