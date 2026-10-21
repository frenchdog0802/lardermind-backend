# Fix Design: Chat empty-state pantry / buy chips show 0

**Bug:** `docs/bugs/web-chat-empty-chips-count-zero.md`  
**RCA:** `docs/rca/web-chat-empty-chips-count-zero-rca.md`  

---

## Fix Approach

1. **Restore / keep** empty-state context chips per `web-agent-chat-ux-design` (`ai.chipPantry` / `ai.chipBuy`), wired with `onViewPantry` / `onViewShoppingList` from `AICookingAssistant`.
2. **Compute counts** via a small pure helper (pantry length; unchecked shopping length) used by `ChatEmptyState`.
3. **Fetch once when chips are shown:** on `ChatEmptyState` mount (when either chip callback is provided), call `fetchAllPantryItems` + `fetchAllShoppingListItems` from `usePantry`. Counts update when context fills.

Do **not** eager-load all pantry domain data in `PantryProvider` (larger scope). Do not change chip navigation semantics.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Eager fetch in `PantryProvider` for all lists | Broader; more API traffic for every authenticated page |
| Pass counts from App after parallel prefetch | More plumbing; same fetch need |
| Show “…” until loaded | Nice UX; not required to fix wrong 0 after load |
| Cache counts in `sessionStorage` | Stale risk; still need network for truth |

## Scope of Change

- `frontend/src/utils/chatEmptyChipCounts.ts` (+ `.test.ts`) — pure count helpers
- `frontend/src/components/ChatEmptyState.tsx` — chips UI + mount fetch when chip callbacks present
- `frontend/src/components/AICookingAssistant.tsx` — pass `onViewPantry` / `onViewShoppingList` into empty state
- Structural/source tests for chip wire-up + fetch
- Docs: mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Revert helper + `ChatEmptyState` / `AICookingAssistant` changes. Chips may again show 0 on cold Chat empty.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Extra API calls on every empty Chat view | Only when chip callbacks passed; one mount fetch |
| Flash of 0 before fetch returns | Accept brief 0→N; same as other list screens |
| Guest / missing callbacks | Omit chips (existing design); skip fetch |

## Regression Test Plan

1. **Unit:** `pantryChipCount` / `buyChipCount` — empty, length, unchecked filter.
2. **Structural:** `ChatEmptyState` source includes `chipPantry`/`chipBuy`, mount `fetchAllPantryItems` + `fetchAllShoppingListItems`; `AICookingAssistant` passes view callbacks into empty state.
3. **Manual:** Stock in Inventory → New chat / F5 on empty Chat → chips show non-zero; chip tap still navigates.

## Confirmation that root cause is fixed

Chat empty path with chips triggers list fetch; after responses, chip counts match pantry / unchecked shopping without visiting Inventory first.
