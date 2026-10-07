# Fix: Chat-created recipe not visible in Recipe Categories

**Bug:** `docs/bugs/chat-recipe-not-visible-in-categories.md`  
**RCA:** `docs/rca/chat-recipe-not-visible-in-categories-rca.md`

---

## Fix Approach

Restore the client-assumed contract: **`GET /api/folder` ensures default folders exist** for the authenticated user before returning the list.

1. Add `ensureDefaultFolders(db, userId)` in `backend-cf/src/db/folder.ts` that idempotently creates missing defaults by case-insensitive name match.
2. Default names (aligned with mobile `DEFAULT_FOLDER_NAMES`): `Uncategorized`, `Favorites`, `Breakfast`, `Lunch`, `Dinner`.
3. Call ensure from `folderRoutes.get('/api/folder')` **before** `listFolders` (skip ensure when `q` search query is present — search should not invent rows mid-filter; or always ensure then filter — prefer always ensure then list with optional `q`).
4. Fail-first test: user with zero folders → GET `/api/folder` returns at least `Uncategorized` (and the other defaults).

Why this over alternatives: smallest server-side fix; web already maps `folder_id` null → Uncategorized once that folder exists; no recipe table migration; matches existing frontend/mobile comments.

## Alternatives Considered

| Option | Why not default |
|--------|-----------------|
| Frontend-only virtual Uncategorized | Workaround; mobile + other clients still broken; duplicates contract |
| Assign Uncategorized in `createRecipe` only | Helps new creates; still leaves empty categories if user never hits folder API first; does not restore list contract |
| Flat recipe list on categories root | Product redesign; out of scope for this bug |
| Backfill all null `folder_id` in D1 | Optional hardening; not required for web visibility once Uncategorized exists |

## Scope of Change

- `backend-cf/src/db/folder.ts` — `ensureDefaultFolders`
- `backend-cf/src/routes/folder.ts` — call ensure on GET list
- `backend-cf/src/routes/domain-crud.test.ts` (or focused folder test) — fail-first coverage
- Docs: mark bug Resolved

**Out of scope (follow-up):** mobile null→Uncategorized filter parity; writing `folder_id` on chat create; UI redesign of categories root.

## Data Migration / Backfill Needs

None required. Existing null-`folder_id` recipes become visible under Uncategorized on web after ensure runs.

## Rollback Plan

Revert ensure call / helper. Folders already created remain; harmless leftover defaults.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Duplicate Uncategorized if name casing differs | Match case-insensitively; only insert when no match |
| Unexpected folders for users who wanted empty list | Product already assumes defaults; names match mobile |
| Race double-insert under concurrent GET | Accept rare duplicates or use unique constraint if present; prefer check-then-insert per name |

## Regression Test Plan

1. Fail-first: GET `/api/folder` with empty store → must include Uncategorized (+ defaults).
2. After fix: same test passes; second GET does not duplicate Uncategorized.
3. Manual: chat createRecipe → open Recipe Categories → Uncategorized shows count ≥ 1 → open folder → recipe listed.
4. Run `backend-cf` vitest suite for domain CRUD / folder.
