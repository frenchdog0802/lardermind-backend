# Feature: Shopping list batch sync to pantry

**Status:** Implemented  
**Scope:** Web + mobile clients, `backend-cf` API (primary); Nest/Spring parity optional follow-up  
**Out of scope:** Full unit conversion (g/ml), pantry storage location, household non-food inventory, AI auto-classification as sole gate, multi-device conflict resolution

---

## 1. Summary

Decouple **「已購買」** from **「已加入廚房庫存」** on the shopping list.

| Today | After |
|-------|-------|
| Checking an item immediately writes quantity to pantry | Checking only marks purchase progress on the list |
| Non-food and accidental checks pollute pantry | User explicitly syncs eligible items in one batch after shopping |
| Uncheck is the only recovery path | Sync shows review + post-sync undo |

**Primary UX:** A **「將已購項目加入庫存」** action (batch button) that syncs checked, not-yet-synced items—default-preselected when they have `ingredient_id` (recipe / meal-plan lineage).

---

## 2. Problem

The restored check→pantry contract (`has_been_added_to_pantry`) fixes the “inventory never updates” bug but creates product noise:

1. **Not all list items are pantry food** — toilet paper, detergent, impulse snacks.
2. **Unit fidelity** — “1 包 / 1 瓶” may not match how the user tracks pantry; blind merge keeps messy units.
3. **Accidental check** — in-store taps should not immediately mutate pantry; users may not know uncheck reverses sync.

Pantry in LarderMind is **kitchen inventory for meal planning**, not a general household stock system. The sync path should respect that boundary.

---

## 3. Goals

| # | Goal |
|---|------|
| G1 | `checked` = purchased on list; no automatic pantry write on check/uncheck |
| G2 | Explicit batch sync adds selected checked items to pantry once (idempotent per item) |
| G3 | Default selection favors pantry-eligible items (`ingredient_id` present) |
| G4 | Lightweight review before commit (toggle items, optional qty/unit tweak) |
| G5 | Post-sync undo (toast) reverses the last batch within a short window |
| G6 | Preserve existing rows already synced (`has_been_added_to_pantry = 1`) without double-add |

---

## 4. Non-goals (this version)

- Automatic g/ml conversion or ingredient catalog unit normalization
- Pantry folder / fridge-freezer location on sync
- New `item_type` taxonomy with ML classification (heuristic + user override only)
- Changing meal-plan → shopping generation logic
- Offline mobile: batch sync while offline (requires network; show clear message)

---

## 5. User stories

### US-1 — In-store checking

As a shopper, I check items as I put them in the cart so I can track progress, **without** changing my kitchen inventory until I am done.

**Acceptance:** Toggle check updates list UI only; pantry list unchanged until batch sync.

### US-2 — Batch sync after checkout

As a user leaving the store, I tap **「將已購項目加入庫存」**, review the preselected food items, confirm, and see pantry update once.

**Acceptance:** Only confirmed items get `has_been_added_to_pantry = 1` and pantry quantity merge.

### US-3 — Skip non-food

As a user who bought toilet paper on the same trip, I see it unchecked in the sync sheet by default (no `ingredient_id`) and it stays out of pantry unless I explicitly include it.

### US-4 — Mistake recovery

As a user who synced too early or included a wrong item, I tap **復原** on the success toast and pantry quantities roll back for that batch.

### US-5 — Already-synced items

As a returning user with items synced under the old contract, those rows stay synced; batch sync does not duplicate them.

---

## 6. UX requirements

### 6.1 Shopping list — checked section

- Checked items remain visible (strikethrough / completed section) as today.
- Visual hint for sync state:
  - **已購 · 待入庫** — `checked && !has_been_added_to_pantry`
  - **已入庫** — `has_been_added_to_pantry` (subtle badge or icon)

### 6.2 Batch sync entry point

- Prominent button when ≥1 item is `checked && !has_been_added_to_pantry`:
  - Label example: **「將 N 項加入庫存」**
- Disabled / hidden when nothing pending.

### 6.3 Review sheet (lightweight)

- Lists pending items with checkboxes (pre-checked if `ingredient_id` set; unchecked if not).
- Editable quantity and unit per row (optional fields; defaults from shopping row).
- Actions: **確認加入** / **取消**.
- Non-blocking copy: items without `ingredient_id` are “通常不需加入廚房庫存”.

### 6.4 Success + undo

- Toast: **「已將 N 項加入庫存」** with **復原** (and optional **編輯** → navigate to pantry).
- Undo window: **~10 seconds** client-side; server supports explicit unsync for the batch.

### 6.5 Uncheck behavior (changed)

- Unchecking a **pending** item: no pantry interaction (flag already 0).
- Unchecking an **already-synced** item: prompt **「此項目已加入庫存，取消勾選是否一併從庫存扣除？」** — Yes → unsync single item; No → uncheck list only (pantry unchanged).

---

## 7. API / contract changes (summary)

Detailed design: `docs/design/shopping-pantry-batch-sync-design.md`.

| Change | Description |
|--------|-------------|
| `PUT /api/shopping-list/:id` | **Remove** pantry side effects on `checked` toggle |
| `POST /api/shopping-list/sync-to-pantry` | **New** — batch merge into pantry |
| `POST /api/shopping-list/unsync-from-pantry` | **New** — reverse batch or single item |
| Response DTO | Expose `has_been_added_to_pantry` (or `synced_to_pantry: boolean`) on shopping items |

**Backward compatibility:** Clients on old behavior expect check→pantry; they must ship with this feature or pantry will stop updating on check (intentional contract change). Coordinate web + mobile release.

---

## 8. Data / migration

- Reuse existing column `has_been_added_to_pantry` — semantics shift from “sync happened on check” to “sync happened via batch (or legacy auto-sync)”.
- **No backfill.** Rows with flag `1` remain synced; rows with `checked=1` and flag `0` appear as “pending sync” in UI.
- Optional later: `user_preferences.shopping_sync_mode` (`batch` | `instant`) — **out of scope v1**.

---

## 9. Edge cases

| Case | Expected behavior |
|------|-------------------|
| Sync empty selection | 400 / client disable confirm |
| Sync item already flag `1` | Skip (idempotent); include in `skipped` response |
| Sync unchecked item | Reject or skip with reason |
| Pantry row missing on unsync | Clear flag; no error |
| Duplicate name merge | Existing `mergeAddPantryItem` rules (ingredient_id then CI name) |
| Offline mobile | Batch button shows offline message; queue not supported for sync endpoint |
| Complete all | Marks all checked only; does **not** auto-sync pantry |
| Delete synced shopping row | Pantry quantity unchanged (same as today) |
| Chat adds shopping items | Items with `ingredient_id` preselected in review sheet |

---

## 10. Security & performance

- All endpoints JWT-scoped; batch operations limited to caller’s `user_id`.
- Batch size cap (e.g. 100 items) to bound D1 transaction time.
- No new PII; same auth middleware as shopping-list routes.

---

## 11. Success metrics (qualitative)

- Users can complete a shopping trip without non-food appearing in pantry by default.
- Support burden: fewer “wrong inventory” reports / manual pantry deletes.
- Batch sync used at least once per active shopper session (analytics optional later).

---

## 12. Related documents

- Bug (superseded contract): `docs/bugs/shopping-check-no-pantry-sync.md`
- Fix (immediate sync): `docs/fixes/shopping-check-no-pantry-sync-fix.md`
- Design: `docs/design/shopping-pantry-batch-sync-design.md`
- Tasks: `tasks/shopping-pantry-batch-sync/`

---

## 13. Open questions (resolve in design or before coding)

| # | Question | Proposed default |
|---|----------|------------------|
| Q1 | Expose `has_been_added_to_pantry` in API vs computed `synced_to_pantry` | Expose boolean `synced_to_pantry` in DTO (maps from column) |
| Q2 | Single-item “add to pantry” from row menu? | v1: only via batch sheet (can select one item) |
| Q3 | Nest/Spring parity in same release? | `backend-cf` first; track parity in checklist |
| Q4 | Undo groups multiple batches? | Undo last batch only (client tracks batch id / item ids) |
