# RCA: Chat empty-state pantry / buy chips show 0 after refresh or new chat

**Bug:** `docs/bugs/web-chat-empty-chips-count-zero.md`  
**Status:** Confirmed via code inspection + reporter screenshot / repro — fixed per fix design  

---

## Root Cause

Empty-state chips (when present) read counts from `PantryProvider` in-memory lists:

- pantry chip → `pantryItems.length`
- buy chip → unchecked `shoppingList` length

Those lists initialize as **`[]`** and are **not** loaded on provider mount. Fetch happens only when:

- `PantryInventory` / `ShoppingList` mounts (`useEffect` → `fetchAll*`), or
- Chat tool-result refresh / chip click handlers that call fetch then navigate

Default post-login view is **`aiAssistant`** only (`visitedViews` starts with that view). Keep-alive therefore never mounts inventory/shopping on cold load or F5. New chat returns to the empty stage with the same still-empty (or never-fetched) context → chips stay **0** even though D1 has stock.

## Contributing Factors

1. Original web-agent-chat-ux design stated “No new network calls” for chips, assuming context was already warm — false on Chat-first entry.
2. `App.tsx` keep-alive mounts inventory only after the user visits those views once (lost on F5).
3. Working-tree `ChatEmptyState.tsx` currently lacks chips / fetch (built `frontend/dist` still has chip UI reading context lengths) — chips can appear in preview/prod while source diverged; either way counts depend on the same cold context.

## Affected Components

| Component | Role |
|-----------|------|
| `pantryContext.tsx` | Source of truth for lists; no boot fetch |
| `ChatEmptyState.tsx` | Displays chip counts from context |
| `AICookingAssistant.tsx` | Empty stage; may omit chip nav props in source |
| `PantryInventory.tsx` / `ShoppingList.tsx` | Only reliable fetchers today |
| `App.tsx` | Chat-first keep-alive; F5 resets visited set |

## Data / State Impact

None on server. Client displays stale/empty counts until a fetch path runs.

## Timeline

Present since context chips landed on Chat empty state without a Chat-path fetch (web-agent-chat-ux task 06).

## Why it wasn't caught earlier

- Manual acceptance checked chip navigation, not count accuracy after F5 / new chat with existing stock.
- Visiting Inventory before Chat warms context and hides the bug for that session.

## Plausible alternatives (ranked)

1. **Confirmed:** Chips bind to cold `[]` context; Chat empty path never fetches.
2. Ruled out as primary: Backend returning empty pantry — Inventory screen shows real items.
3. Ruled out: New-chat API clearing pantry — pantry APIs are separate from chat sessions.
