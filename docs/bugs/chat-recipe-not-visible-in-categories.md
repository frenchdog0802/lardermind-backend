# Bug: Chat-created recipe not visible in Recipe Categories

**Status:** Resolved  
**Resolved by:** `GET /api/folder` ensures default folders (incl. Uncategorized) so null-`folder_id` chat recipes are browsable  
**Fix design:** `docs/fixes/chat-recipe-not-visible-in-categories-fix.md`  
**RCA:** `docs/rca/chat-recipe-not-visible-in-categories-rca.md`

---

## Current Behavior

After chat successfully creates a recipe (assistant message like「已新增宮保雞丁到你的食譜中」and a Recipe card with ingredients/steps), opening the Recipe section shows **Recipe Categories** with an empty grid — no categories and no way to open the new recipe from that screen.

## Expected Behavior

A recipe created via chat should be discoverable in the Recipe section. At minimum, the user should see a category (e.g. Uncategorized) that contains the new recipe, and opening it should list that recipe.

## Reproduction Steps

1. Sign in on web (`frontend/`).
2. In AI chat, ask to create a full recipe (e.g. 宮保雞丁) and Approve the `createRecipe` tool if prompted.
3. Confirm the reply shows success + a Recipe card with non-zero ingredients/steps.
4. Open Recipes / Recipe Manager → land on **Recipe Categories**.
5. Observe: category grid is empty (or has no place that lists the new recipe).

## Environment

- App: `frontend/` Recipe Manager (web)
- Backend: `backend-cf` chat tools + `/api/recipe` + `/api/folder`
- Auth: normal signed-in user with few/no manually created categories
- Related: same symptom likely on mobile Recipe Manager if folders were never created

## Related Files

- `frontend/src/components/RecipeManager.tsx` — categories-first UI; maps null `folder_id` → Uncategorized
- `frontend/src/contexts/pantryContext.tsx` — `fetchAllRecipes` / `fetchAllFolders`
- `backend-cf/src/agent/tools/execute.ts` — `createRecipe` tool (often `folder_id` omitted → null)
- `backend-cf/src/db/recipe.ts` — `createRecipe` / `listRecipes`
- `backend-cf/src/routes/folder.ts` — `GET /api/folder`
- `backend-cf/src/db/folder.ts` — folder CRUD
- `mobile/src/screens/RecipeManagerScreen.tsx` — similar categories UI; comments expect default folders

## Impact Scope

- Users who create recipes only via chat (never create a category) see an empty Recipe Categories screen.
- Recipes may still exist in D1 (`recipes` with `folder_id` null) and appear on chat cards / Edit Recipe deep-links, but not via the categories browse path.
- Severity: **Major** — core “save recipe from chat → find it later” loop broken for new users.

## Reproducibility Notes

- Screenshot evidence: chat success card for 宮保雞丁; Recipe Categories page blank with only “New Category”.
- Code path: categories view renders `(folders ?? []).map(...)` only; recipes are shown only after selecting a folder.
- Frontend comment claims default folders are created on `GET /api/folder`; need RCA to confirm whether that still happens.

## Additional Information Needed (optional)

- Whether `GET /api/recipe` returns the created recipe for the same user (to distinguish “not persisted” vs “persisted but not listed under categories”).
- Whether any folders already exist for the reporting account.

## Related Documents

- `docs/design/chat-langchain4j-tools.md` (AI createRecipe default folder = null / uncategorized)
- `docs/bugs/chat-recipe-created-card-empty.md` (related card payload bug; different symptom)
