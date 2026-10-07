# RCA: Chat-created recipe not visible in Recipe Categories

**Bug:** `docs/bugs/chat-recipe-not-visible-in-categories.md`

---

## Root Cause

Recipe Manager’s top-level screen only lists **folders** (`GET /api/folder`). Chat `createRecipe` persists recipes with `folder_id = null` (by design). The web UI treats null as belonging to a folder named **Uncategorized**, but **`backend-cf` never creates that default folder** on list (or elsewhere). For users with an empty `folders` table, the categories grid renders nothing — even when recipes exist in D1 — so the new dish is unreachable from the Recipe section.

## Contributing Factors

1. **Categories-first UX** — `RecipeManager.tsx` shows recipes only after `currentFolder` is selected; orphan/null-folder recipes never appear at the root.
2. **Stale contract** — Frontend comment: “Default folders are created/deduped by the backend on GET /api/folder.” Mobile also documents `DEFAULT_FOLDER_NAMES` as “created on backend if not present.” `folderRoutes.get('/api/folder')` only calls `listFolders` — no ensure/seed.
3. **AI create path omits folder** — `execute.ts` `createRecipe` passes `folder_id` only if the model supplies it; otherwise null. Design default is “null / uncategorized.”
4. **Mobile stricter filter** — Mobile filters with `recipe.folder_id !== currentFolder.id` and does not map null → Uncategorized, so even after seeding Uncategorized, chat recipes stay invisible on mobile until mapping or assignment is fixed (related follow-up).

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/routes/folder.ts` | Missing ensure-defaults on GET |
| `backend-cf/src/db/folder.ts` | No `ensureDefaultFolders` helper |
| `frontend/src/components/RecipeManager.tsx` | Depends on Uncategorized existing for null `folder_id` |
| `backend-cf` chat `createRecipe` | Writes recipes with null folder |

## Data / State Impact

- Recipes already created via chat remain valid rows with `folder_id` null.
- No destructive migration required: seeding Uncategorized makes existing null-folder recipes appear under that category on web (via client `recipeFolderId` mapping).
- Optional later: backfill `folder_id` to Uncategorized for consistency across clients.

## Timeline

- Introduced when recipe UI became folder/category-first while AI create kept null folder, and when `backend-cf` folder list dropped (or never ported) default-folder ensure that clients still assume.
- Not caught earlier because manual “New Category” / “Add Recipe” always sets a real `folder_id`, so the empty-folders + chat-create path was rare in manual QA.

## Why it wasn't caught earlier

- Happy-path QA often creates a category first, then a recipe inside it.
- Chat success is validated by the Recipe **card**, not by navigating to Recipe Categories.
- No integration test asserted “user with zero folders + createRecipe → GET /api/folder includes Uncategorized and recipe is browsable.”

## Confirmed vs Ruled Out

| Hypothesis | Verdict |
|------------|---------|
| createRecipe does not persist | Unlikely for this report — success card showed 12 ingredients / 6 steps after prior card-payload fix; list API returns all user recipes regardless of folder |
| Wrong user / auth scoping | Unlikely — same session can open Edit Recipe from card |
| Categories page only broken for search | Ruled out — root view never mounts recipe list |
| Missing Uncategorized + categories-only UI | **Confirmed** |
