# RCA: D1 LIKE pattern too complex

## Root cause
List queries matched text with `LOWER(col) LIKE LOWER(?)` and bound `%<user text>%`. Cloudflare D1 caps LIKE/GLOB patterns at 50 bytes, so any name/query over ~48 bytes throws. The `createRecipe` tool calls `listRecipes(db, userId, mealName)` for duplicate detection, so every long recipe name failed (short names saved, hence 2 of 7). The same pattern is used by the shopping-list, ingredient, folder and meal-plan list queries (`?query=` search), which fail identically on long text.

## Contributing factors
- Local tests run on node:sqlite (50,000-byte limit), so the limit never surfaced.
- User `%` / `_` were interpreted as wildcards (unescaped).

## Affected components
`listRecipes`, `listShoppingListItems`, `listIngredients`, `listFolders`, `listMealPlans`; agent `createRecipe` dedupe.
