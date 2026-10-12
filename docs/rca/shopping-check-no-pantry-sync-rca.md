# RCA: Shopping list check does not add to kitchen inventory

**Bug:** `docs/bugs/shopping-check-no-pantry-sync.md`  
**Status:** Confirmed via code inspection + product docs  

---

## Root Cause

`backend-cf` shopping-list update only writes fields on `shopping_list_items` (`name`, `quantity`, `unit`, `checked`, `ingredient_id`). It never:

1. Calls pantry merge-add / create when `checked` becomes `true`
2. Subtracts pantry quantity when `checked` becomes `false`
3. Tracks `has_been_added_to_pantry` (column absent from D1 schema)

Clients only call `PUT /api/shopping-list/:id` then refresh pantry; they do not call `POST /api/pantry-item` on check. Inventory therefore stays unchanged after purchase.

Confirmed:

| Check | Result |
|-------|--------|
| `db/shopping-list.ts` `updateShoppingListItem` | Single `UPDATE shopping_list_items … checked = ?` |
| `routes/shopping-list.ts` PUT | No pantry side effect after update |
| `migrations/0004_domain_crud.sql` | No `has_been_added_to_pantry` |
| `mergeAddPantryItem` | Exists for vision/chat-style merge; unused by shopping routes |
| Product docs | Explicit check ↔ pantry sync contract |

## Contributing Factors

1. **Domain CRUD port scoped to CRUD only** — `backend-cf-domain-crud` shipped shopping tables/routes without Spring/Nest check→pantry side effects.
2. **Pantry CRUD restored later** (`inventory-add-fails` / `backend-cf-pantry-crud`) without reconnecting the shopping sync path.
3. **Clients assume server sync** — mobile/web refresh pantry after toggle but never write pantry themselves.
4. **No regression test** for “check shopping → pantry quantity increases”.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/db/shopping-list.ts` | Updates `checked` only |
| `backend-cf/src/routes/shopping-list.ts` | PUT/POST entry points |
| `backend-cf/migrations/0004_domain_crud.sql` | Missing sync flag column |
| `backend-cf/src/db/pantry.ts` | Has `mergeAddPantryItem`; not wired from shopping |
| Web/mobile shopping UI + `pantryContext` | Toggle + refresh only |

## Data / State Impact

- Existing checked shopping rows may already show purchased in UI with no pantry rows — one-time backfill is optional (see fix design).
- Without a sync flag, naïve “always add on checked=true” would double-add on every PUT that resends `checked: true`.

## Timeline

Introduced when shopping-list CRUD landed on `backend-cf` without the historical Spring sync semantics. Persists after pantry CRUD was added, because sync was never reattached.

## Why it wasn't caught earlier

- Domain CRUD tests cover create/list shopping, not check→pantry.
- Empty inventory looks like a normal empty state.
- Manual pantry add and chat/vision add paths can still populate inventory, masking the gap for some users.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** Missing server-side check→pantry side effect + missing flag column.
2. Less likely: Client forgot to call pantry API — product contract is server-side sync; clients match that design.
3. Unlikely: Pantry list filter hiding items — create path for manual add works; empty state is “no rows”.
4. Unlikely: Auth/user mismatch between shopping and pantry — same `userId` middleware on both route groups.

## Classification note

This is a **bug / migration regression** against an existing product contract, not a new feature. Fix belongs in bug-fix flow on `backend-cf` shopping update/create paths.
