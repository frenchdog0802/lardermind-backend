# 06 — Context chips (P2)

## Goal

Replace muted pantry/buy paragraphs with tappable context chips.

## Acceptance

- [ ] Chips render counts via `ai.chipPantry` / `ai.chipBuy`
- [ ] Pantry chip calls `onViewPantry` when provided
- [ ] Buy chip calls `onViewShoppingList` when provided
- [ ] Missing callback → that chip omitted
- [ ] `AICookingAssistant` passes existing pantry/shopping navigation props into `ChatEmptyState`
- [ ] Chips do not clear session or block suggestions
