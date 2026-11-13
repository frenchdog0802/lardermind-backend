# RCA: Chat recipe update duplicates

**Bug:** [chat-recipe-update-duplicates.md](../bugs/chat-recipe-update-duplicates.md)

## Root cause

Agent exposes only `createRecipe`. DB/HTTP already support `updateRecipe`, but the tool is missing, and the system prompt steers “propose via createRecipe” with no update-in-place rule.

## Contributing Factors

HITL allowlist / card types only wire create. Same-name recipes are allowed in storage.

## Affected Components

Agent tools, HITL summaries, recipe cards (`recipe_updated`).

## Data / State Impact

Duplicate recipe rows; old version left untouched.

## Timeline

Since CF agent port without updateRecipe.

## Why it wasn't caught earlier

First-win flows emphasize create; update language appears in longer Free-account sessions.
