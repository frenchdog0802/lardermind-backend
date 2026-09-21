# Design: Cloudflare pantry CRUD

**Feature:** `docs/features/backend-cf-pantry-crud.md`  
**Bug:** `docs/bugs/inventory-add-fails.md`

---

## 1. Architecture

```
mobile/web pantryItemApi
        │
        ▼
backend-cf routes/pantry.ts   (Hono + requireAuth)
        │
        ▼
db/pantry.ts                  (D1 prepare/bind)
        │
        ▼
D1 pantry_items
```

Mount in `index.ts` beside existing route modules. No new bindings.

---

## 2. Schema

### Existing (`0001_init.sql`)

`pantry_items(id, user_id, name, quantity TEXT, unit, notes, created_at, updated_at)`

### Migration `0003_pantry_ingredient_id.sql`

```sql
ALTER TABLE pantry_items ADD COLUMN ingredient_id TEXT;
CREATE INDEX IF NOT EXISTS idx_pantry_items_user_ingredient
  ON pantry_items(user_id, ingredient_id);
```

Nullable; no FK (no ingredients catalog on CF yet).

---

## 3. DTO & payload helpers

```ts
type PantryItemDto = {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  ingredient_id?: string;
  notes?: string;
  details: {
    quantity: number;
    unit: string;
    ingredient_id?: string;
    notes?: string;
  };
};
```

**Input coalesce** (create/update/bulk item):

For each field `name | quantity | unit | notes | ingredient_id`:

1. If top-level value is present (`!== undefined && !== null`), use it.
2. Else use `details[field]` if present.
3. `name` trimmed; empty → validation error on create.
4. `quantity`: coerce with `Number(...)`; `NaN` → 400.
5. `unit`: string; if missing/blank after coalesce → `'pcs'`.

**Persistence:** store `quantity` as `String(number)` in D1; read back with `Number` (invalid → `0`).

**Ids:** `crypto.randomUUID()`.

---

## 4. API

All routes: `Authorization: Bearer` via `requireAuth`. Variables: `userId`.

| Method | Path | Handler summary |
|--------|------|-----------------|
| GET | `/api/pantry-item` | `listByUser` → `ok(dto[])` |
| GET | `/api/pantry-item/:id` | `getOwned` or 404 |
| POST | `/api/pantry-item` | validate → insert → `ok(dto)` |
| PUT | `/api/pantry-item/:id` | patch owned fields → `ok(dto)` or 404 |
| DELETE | `/api/pantry-item/:id` | delete owned → `ok(null)` or 404 |
| POST | `/api/pantry-item/bulk` | body `{ items: [...] }` non-empty → insert each → `ok(dto[])` |
| PUT | `/api/pantry-item/bulk` | body `{ items: [...] }` → upsert each (**set** qty) → `ok(dto[])` |

### PUT bulk upsert matching (per item, owned rows only)

1. If `id` present and owned row exists → update that row (set fields).
2. Else if `ingredient_id` present and owned row with same `ingredient_id` → update.
3. Else if `name` present and owned row with same name **case-insensitive** → update.
4. Else → create new row (requires name).

Quantity on match is **replaced**, not added.

### Route ordering

Register `/api/pantry-item/bulk` **before** `/api/pantry-item/:id` so `bulk` is not captured as an id.

---

## 5. DB API (`db/pantry.ts`)

- `listPantryItems(db, userId)`
- `getPantryItem(db, userId, id)`
- `createPantryItem(db, userId, input)`
- `updatePantryItem(db, userId, id, patch)`
- `deletePantryItem(db, userId, id)` → boolean
- `findByIngredientId(db, userId, ingredientId)`
- `findByNameCi(db, userId, name)` — `LOWER(name) = LOWER(?)`
- `toPantryItemDto(row)`

Prefer `batch()` for bulk inserts when straightforward; sequential is acceptable for v1 correctness.

---

## 6. Errors

Reuse `ok` / `fail`. Messages short and client-safe (`Not found`, `Name is required`, `Invalid quantity`, `items required`).

---

## 7. Tests (`routes/pantry.test.ts`)

Fail-first style then green:

1. Unauthenticated GET/POST → 401  
2. Create (flat+details) → 200; list contains item  
3. Create (web-style details-only qty/unit) → response `details.quantity` correct  
4. Get/update/delete ownership (user B cannot touch A’s id) → 404  
5. POST bulk creates N items  
6. PUT bulk sets quantity on name match (not adds)  
7. Empty name / empty bulk → 400  

Mock D1 in-memory map similar to upload tests, or thin SQL stub covering the statements used.

---

## 8. Docs / bug closure

- Update `backend-cf/README.md` pantry row.
- Update `docs/design/backend-cf-api-design.md` note (CRUD later → done for pantry).
- Write `docs/fixes/inventory-add-fails-fix.md` pointing at this feature.
- Mark bug resolved when tests pass and routes mounted.

---

## 9. Alternatives considered

| Option | Why not |
|--------|---------|
| Client-only local storage | Does not restore multi-device / server truth |
| Proxy to resurrected Nest | Nest removed; CF is production |
| Minimal GET+POST only | User requested full Nest parity |
| JSON blob in `notes` for ingredient_id | Worse querying for PUT bulk |

---

## 10. Rollback

Remove pantry route mount + revert migration on remote if needed (`ingredient_id` column is additive and safe to leave). Clients again get 404.
