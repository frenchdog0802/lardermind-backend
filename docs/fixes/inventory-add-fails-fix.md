# Fix design: Kitchen Inventory add fails

**Bug:** `docs/bugs/inventory-add-fails.md`  
**RCA:** `docs/rca/inventory-add-fails-rca.md`  
**Implementation vehicle:** feature `backend-cf-pantry-crud` (not a client-only patch)

---

## Fix Approach

Implement Nest-compatible pantry CRUD on `backend-cf` (D1 + Hono routes) so `POST/GET/PUT/DELETE /api/pantry-item*` succeed. This is the confirmed root-cause fix (missing API after Nest cutover).

See: `docs/features/backend-cf-pantry-crud.md`, `docs/design/backend-cf-pantry-crud-design.md`.

## Alternatives Considered

| Alternative | Verdict |
|-------------|---------|
| Alert-only on mobile when create fails | **Workaround** — does not restore inventory |
| Point clients back at Nest | Nest removed from repo/prod |
| Local-only pantry cache | Loses sync; rejects product contract |

## Scope of Change

- `backend-cf`: migration `ingredient_id`, `db/pantry.ts`, `routes/pantry.ts`, mount, tests, README
- Docs: feature/design/tasks + this fix design; bug status → Resolved when shipped
- **Out of scope:** vision merge-add, mobile Alert polish (optional follow-up)

## Data Migration / Backfill

Additive column only; no backfill. Empty table for CF-native users is expected.

## Rollback Plan

Unmount pantry routes; clients return to 404. Column may remain.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Payload shape mismatch (web details-only) | Dual parse + response `details`; covered by tests |
| PUT bulk vs merge-add confusion | Document set-only; no vision in this fix |
| IDOR | Always filter `user_id` |

## Regression Test Plan

- Vitest route suite (auth, CRUD, bulk set, ownership)
- Manual: mobile Kitchen Inventory add → item appears; reload still present
