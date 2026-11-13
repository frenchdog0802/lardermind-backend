# Fix: Chat recipe update duplicates

**Bug:** [chat-recipe-update-duplicates.md](../bugs/chat-recipe-update-duplicates.md)  
**RCA:** [chat-recipe-update-duplicates-rca.md](../rca/chat-recipe-update-duplicates-rca.md)

## Fix Approach

1. Add mutating tool `updateRecipe` (recipe_id required; patch meal_name / instructions / ingredients / folder_id).  
2. Wire execute → `updateRecipe` DB helper; card type `recipe_updated`.  
3. System prompt: when user asks to update/edit an existing recipe, `getRecipeDetails` / `listMyRecipes` then **updateRecipe**; do not `createRecipe` unless they ask for another copy.  
4. Optional guard: if `createRecipe` meal_name matches an existing recipe case-insensitively, return error asking to use updateRecipe or confirm “make another.”

## Alternatives Considered

| Option | Why not |
|--------|---------|
| Prompt-only | Model still only has create tool |
| Delete+create | Loses id / calendar links |

## Scope of Change

- `definitions.ts`, `execute.ts`, `hitl.ts`, `cards.ts`, `system-prompt.ts` (+ tests)

## Data Migration / Backfill

None (historical duplicates stay).

## Rollback Plan

Remove tool + prompt lines.

## Risk Assessment

Medium: wrong recipe_id could patch the wrong recipe — require id from prior list/get.

## Regression Test Plan

Unit: execute updateRecipe patches ingredients; createRecipe same-name returns guidance error when duplicate guard on.
