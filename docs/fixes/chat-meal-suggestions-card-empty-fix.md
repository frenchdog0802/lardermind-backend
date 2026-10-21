# Fix: Emit flat `meal_suggestions` cardData matching clients

**Bug:** `docs/bugs/chat-meal-suggestions-card-empty.md`  
**RCA:** `docs/rca/chat-meal-suggestions-card-empty-rca.md`  

---

## Fix Approach

In `backend-cf`, map each suggestion into the **flat** card payload clients already render.

1. Add `mealSuggestionsCardData(suggestions)` in `cards.ts` (same pattern as `recipeCreatedCardData`).
2. In `suggestMealsFromPantry`, keep tool **content** JSON with full ranking fields for the LLM (`id`, `meal_name`, `score`, `cookable`, …).
3. Set `cardData` to the flat client shape:

```ts
cardData: {
  suggestions: suggestions.map((s) => ({
    recipeId: s.id,
    recipeName: s.meal_name,
    matchScore: /* 0–100 from matched / total ingredients */,
    missingIngredients: s.missingIngredients,
  })),
}
```

**`matchScore`:** do **not** pass through sort `score` (cookable boost of +100). Compute display percent when building each scored row:

```ts
matchScore =
  ingredients.length === 0
    ? 0
    : Math.round((matched.length / ingredients.length) * 100);
```

Why: Fix at the producer so web + mobile both work; matches existing UI contract and prior recipe-card fix pattern.

Optional same-PR hardening (compatibility for old history): thin client remap in web/mobile when rendering meal suggestions:

```ts
recipeName ?? s.meal_name
matchScore ?? s.score  // only if already 0–100; prefer backend fix for new messages
```

Prefer remapping `meal_name` → `recipeName` on the client for old rows; do **not** treat legacy `score` as percent (would show >100%). Old history without `matchScore` may still show `% match` unless we also store/compute percent in content — acceptable for pre-fix messages, or client can derive from `matchedIngredients` length if present.

Minimal client fallback for old messages:

```ts
recipeName: s.recipeName ?? s.meal_name
matchScore: s.matchScore ?? (
  Array.isArray(s.matchedIngredients) && /* total unknown */
  undefined
)
```

Ship **backend flat cardData** as primary; add client `recipeName ?? meal_name` fallback only (cheap). Leave legacy `% match` without number if `matchScore` absent — primary fix covers new turns.

## Alternatives Considered

| Option | Why not default |
|--------|-----------------|
| Remap only in web `AICookingAssistant` | Mobile stays broken; history stores wrong shape |
| Change UI to read `meal_name` / `score` | Two clients; `score` is not a percent |
| Pass `score` as `matchScore` | Cookable rows become `10x% match` |

## Scope of Change

- `backend-cf/src/agent/tools/cards.ts` — `mealSuggestionsCardData`
- `backend-cf/src/agent/tools/execute.ts` — use mapper; compute `matchScore`
- Tests: fail-first assert `cardData.suggestions[]` has `recipeId` / `recipeName` / `matchScore` (0–100)
- Optional: web/mobile `meal_name` → `recipeName` fallback when rendering

Out of scope: changing cookable sort algorithm; i18n of card chrome; multi-card UX.

## Data Migration / Backfill Needs

None required. Old history may still show blank names until optional client fallback; new tool runs emit flat fields.

## Rollback Plan

Revert mapper + execute `cardData` change; clients unchanged for primary fix.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| LLM-facing tool message accidentally changed | Only change `cardData`; keep `content` full objects |
| Tests lock backend-shaped suggestion keys in content | Assert content separately from cardData |
| Percent formula surprises | Document matched/total ingredients; clamp 0–100 |

## Regression Test Plan

1. Fail-first: `suggestMealsFromPantry` with overlapping pantry → `cardData.suggestions[0]` has `recipeName`, `recipeId`, numeric `matchScore` in 0–100 (not `meal_name` / raw sort `score`).
2. Existing cookable ranking test on **content** still passes.
3. Manual: ask cook-from-pantry → Meal suggestions card shows names and `N% match`.
