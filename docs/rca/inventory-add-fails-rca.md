# RCA: Kitchen Inventory add item fails

**Bug:** `docs/bugs/inventory-add-fails.md`  
**Status:** Confirmed via code inspection + production HTTP probe  

---

## Root Cause

Mobile (and web) inventory clients still call the Nest-era pantry CRUD contract:

- `POST /api/pantry-item` (create)
- `GET /api/pantry-item` (list)
- plus update/delete/bulk variants

The production API is **Cloudflare Workers only** (`backend-cf`). That Worker **does not mount any pantry routes**. Unmatched paths hit `app.notFound` → **404** `{ success: false, message: "Not found" }`.

Therefore create never persists, list never returns items, and the UI stays on **"No items found"**.

Confirmed:

| Check | Result |
|-------|--------|
| `backend-cf/src/index.ts` routes | health, auth, chat, subscription, upload, media only — no pantry |
| D1 `pantry_items` | Present in `migrations/0001_init.sql` but unused by API |
| Design / README | Explicitly “schema only; CRUD later” / “Pantry … Not yet” |
| Prod probe | `POST https://api.lardermind.com/api/pantry-item` → **404 Not found** |

## Contributing Factors

1. **Nest/`backend-node` removed** while clients kept calling `/api/pantry-item`.
2. **CF cutover shipped without pantry CRUD** (documented as deferred).
3. **Silent mobile UX** — `PantryInventoryScreen.handleAddItem` always closes the form and does not Alert on `addPantryItem` failure, so the failure looks like a no-op rather than an API error.
4. **List uses the same missing route**, so even a successful local optimistic insert would not survive refresh (mobile does not optimistic-insert on create failure).

## Affected Components

| Component | Role |
|-----------|------|
| `mobile/src/api/pantryItem.ts` | `POST/GET/PUT/DELETE pantry-item*` |
| `mobile/src/contexts/pantryContext.tsx` | Does not append on `!response.success` |
| `mobile/src/screens/PantryInventoryScreen.tsx` | Ignores create failure; closes form |
| `frontend/src/api/pantryItem.ts` | Same Nest contract |
| `backend-cf/src/index.ts` | No pantry mount → 404 |
| `backend-cf/migrations/0001_init.sql` | `pantry_items` table unused |

## Data / State Impact

- No pantry rows are written via the CF API today.
- No schema migration is required to unblock CRUD against the existing `pantry_items` table (columns: `id`, `user_id`, `name`, `quantity`, `unit`, `notes`, timestamps).
- Quantity is stored as `TEXT` in D1; clients treat quantity as number — adapter needed in any CF implementation.

## Timeline

Introduced at **Nest → Cloudflare-only cutover**, when pantry CRUD was deferred (“CRUD later”) while clients continued to use Nest paths. Present whenever `EXPO_PUBLIC_API_BASE_URL` / web API base points at `backend-cf`.

## Why it wasn't caught earlier

- Pantry was explicitly out of scope for early `backend-cf` milestones (auth, chat, upload).
- Manual add shows no error toast/Alert, masking the 404.
- Inventory empty state is indistinguishable from “user has no items”.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** Missing CF `/api/pantry-item*` → 404 → create/list fail.
2. Less likely: Auth-only failure — would typically be **401**, not the observed **404 Not found** on unauthenticated prod probe of the same path.
3. Less likely: Client validation / unit enum — empty name returns early without closing in a “failed add” sense; screenshot path includes a normal Add tap with unit selected.
4. Unlikely: CORS — native mobile fetch to same API host; prod response is application JSON 404 from the Worker.

## Systemic pattern?

Any client feature still depending on Nest-only domains (recipes, meal plans, etc.) will fail the same way against `backend-cf` until those routes are implemented or clients are narrowed.

## Classification note

Restoring add requires **implementing pantry CRUD on Workers** (new API surface against an existing table), not a one-line client patch. That work is larger than a typical bugfix and aligns with the **new feature** flow unless scoped to a minimal Nest-compatible subset under an explicit fix design.
