# Feature: Cloudflare pantry CRUD (`backend-cf/`)

**Status:** Implemented (`backend-cf/` pantry routes + D1)  
**Scope:** Nest-compatible `/api/pantry-item*` CRUD + bulk on Workers + D1  
**Out of scope:** Vision recognize/apply, merge-add helper, ingredients catalog API, recipes/meal-plan, client UX toasts (optional follow-up)

**Related bug:** `docs/bugs/inventory-add-fails.md` (prod 404 after Nest cutover)

---

## 1. Summary

After Nest/`backend-node` removal, mobile and web Inventory still call `/api/pantry-item*`. `backend-cf` has a `pantry_items` table but **no routes**, so create/list fail with 404 and the Kitchen Inventory UI stays empty.

This feature restores **full Nest-shaped pantry CRUD** on the Cloudflare Worker so Inventory add/list/update/delete works again via URL-only cutover (already pointed at CF).

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Host | `backend-cf/` only | Production API is CF-only |
| Contract | Nest paths + `{ success, message, data? }` | Match mobile/web clients |
| Auth | JWT on all pantry routes | Same as Nest / other CF protected routes |
| Storage | Existing D1 `pantry_items` + `ingredient_id` column | Schema mostly present; clients send `ingredient_id` |
| Payload | Accept flat **and** `details.*` | Mobile sends both; web create puts qty/unit only in `details` |
| Response | Flat fields **and** nested `details` | Web `fromDto` reads qty/unit only from `details` |
| Bulk | Implement `POST /bulk` + `PUT /bulk` | User asked for full Nest parity |
| PUT bulk semantics | **Set** quantity (upsert); not merge-add | Nest docs; merge-add stays vision/chat follow-up |
| Ownership | Always scope by `user_id` | Safer than legacy open reads |

### What changes

| Area | Before | After |
|------|--------|-------|
| Worker routes | No pantry | Full `/api/pantry-item*` |
| D1 | Table without `ingredient_id` | + nullable `ingredient_id` |
| Inventory clients | 404 silent failure | Persist + list items |
| README | “Pantry … Not yet” | Documented as implemented |

---

## 2. Requirements

### 2.1 Endpoints (JWT required)

| Method | Path | Behavior |
|--------|------|----------|
| `GET` | `/api/pantry-item` | List current user’s items |
| `GET` | `/api/pantry-item/:id` | Get one owned item |
| `POST` | `/api/pantry-item` | Create item |
| `PUT` | `/api/pantry-item/:id` | Update owned item |
| `DELETE` | `/api/pantry-item/:id` | Delete owned item |
| `POST` | `/api/pantry-item/bulk` | Bulk create |
| `PUT` | `/api/pantry-item/bulk` | Bulk upsert (**set** qty) |

### 2.2 Create / update fields

- Required for create: non-empty `name` (top-level or resolvable), `quantity` (number or numeric string), `unit` (string; default `pcs` if missing empty).
- Optional: `notes`, `ingredient_id`.
- Prefer top-level field when present; else read from `details`.

### 2.3 Responses

- Envelope: `{ success, message, data? }`.
- List `data`: `PantryItemDto[]`.
- Single create/get/update `data`: one `PantryItemDto` (flat + `details`).
- Bulk create `data`: `PantryItemDto[]`.
- Bulk upsert `data`: `PantryItemDto[]` (affected/resulting rows for the request).
- DTO must include at least: `id`, `name`, `quantity` (number), `unit`, and `details: { quantity, unit, … }` so both mobile and web parsers work.

### 2.4 Errors

| Case | Status |
|------|--------|
| Missing/invalid JWT | 401 |
| Validation (empty name, empty bulk `items`) | 400 |
| Not found / not owned | 404 |
| Unhandled | 500 |

---

## 3. Non-goals

- `POST /api/pantry-vision/*` and merge-add quantity semantics.
- Ingredients catalog table/API.
- Storing `unit_kind` / `item_planned` / `item_to_buy` (clients treat as optional; omit).
- Changing mobile/web API client paths (already correct).
- Postgres / Nest revival.

---

## 4. Edge / security / UX / performance

| Area | Concern | Requirement |
|------|---------|-------------|
| Security | IDOR | All get/update/delete filtered by `user_id` |
| Compat | Dual payload | Flat ∪ `details` on input; both on output |
| Data | `quantity TEXT` in D1 | API number ↔ string adapter |
| UX | Silent mobile add | API fix unblocks; optional Alert is follow-up |
| Bulk | Empty `items` | 400 |
| Upsert key | PUT bulk | Prefer `id`, else `ingredient_id`, else case-insensitive `name` |

---

## 5. Success criteria

- [x] All seven routes mounted and JWT-protected
- [x] Web create (details-only qty/unit) returns parseable qty (vitest)
- [x] Vitest coverage for happy path + 401/400/404 + bulk set semantics
- [x] README no longer lists pantry as “Not yet”
- [x] Bug `inventory-add-fails` marked resolved via this feature
- [ ] Manual: mobile add + list against local/deployed Worker (post-deploy smoke)

---

## 6. References

- Design: [backend-cf-pantry-crud-design.md](../design/backend-cf-pantry-crud-design.md)
- Bug / RCA: [inventory-add-fails.md](../bugs/inventory-add-fails.md), [inventory-add-fails-rca.md](../rca/inventory-add-fails-rca.md)
- Nest contract notes: [pantry-image-recognition.md](./pantry-image-recognition.md)
- Tasks: [tasks/backend-cf-pantry-crud/](../../tasks/backend-cf-pantry-crud/)
