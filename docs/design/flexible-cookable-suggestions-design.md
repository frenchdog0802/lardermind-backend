# Design: Flexible cookable suggestions

**Feature:** [flexible-cookable-suggestions.md](../features/flexible-cookable-suggestions.md)  
**Status:** Implemented (Phases A–B).

---

## 1. Architecture overview

```text
                    ┌─────────────────────────────┐
                    │  user_preferences            │
                    │  assume_basic_seasonings     │
                    └──────────────┬──────────────┘
                                   │
listPantry / soft-reserve ──┐      │
list recipes + ings ────────┼──► suggestMealsFromPantry
unit_conversion_table ──────┘      │
                                   ▼
                    classify missing → cookStatus
                    (+ optional define_unit actions)
                                   │
                    ┌──────────────┼──────────────┐
                    ▼              ▼              ▼
               tool content    meal_suggestions  define_unit card
               (LLM narrative) card (+ status)   (Phase B)
```

**Fit:** Extends existing `suggestMealsFromPantry` in `backend-cf` — same soft-reserve **available** pool as kitchen-closed-loop Phase 4. Does **not** change confirm-deduct or soft-reserve engines.

**Clients:** Web + mobile chat already render `meal_suggestions` from `cardType` / `cardData`. Phase B adds a new card type (or nested action) in the same aggregate-card pipeline (`cards.ts` + client switch).

---

## 2. Phase A — Conditionally cookable

### 2.1 Constants

```ts
/** System-level staples; not user-editable in v1. */
export const DEFAULT_SEASONINGS = [
  '油', '鹽', '醬油', '糖', '白胡椒', '米酒', '蒜', '薑',
] as const;
```

Normalize via existing `normalizeName` before ∈ checks. Optionally also normalize DEFAULT list once at module load.

### 2.2 Preferences

| Field | Type | Default | Notes |
|-------|------|---------|--------|
| `assume_basic_seasonings` | INTEGER 0/1 or JSON bool | `1` / true | D1 migration on `user_preferences` |
| DTO | `assumeBasicSeasonings: boolean` | `true` | `getPreferences` / `updatePreferences` / Settings UI |

`updatePreferences` HITL path already exists — extend input + DTO; no new mutating tool required.

### 2.3 Classification (core algorithm)

Given per-recipe `matched[]`, `missing[]` from **available** stock (current qty compare; Phase B adds unit-aware compare):

```text
function classify(missing, assumeOn):
  if missing.length === 0 → cookable
  if assumeOn && missing.every(m => isDefaultSeasoning(m))
    → conditionally_cookable
  else → uncookable
```

**Hard-short narrative filter:**  
`missingMains = missing.filter(m => !isDefaultSeasoning(m))`  
When `uncookable` and `missingMains.length > 0`, agent/card **primary** shortage list = `missingMains` (seasonings may remain in full `missingIngredients` for tooling honesty).

### 2.4 Tool / card contract (backward compatible)

Keep boolean `cookable` (= status === cookable) for existing tests/LLM habits. Add:

| Field | Meaning |
|-------|---------|
| `cookStatus` | `'cookable' \| 'conditionally_cookable' \| 'uncookable'` |
| `conditionalSeasonings` | string[] — missing seasonings when status is conditional; else omit/empty |
| `missingIngredients` | full missing (unchanged semantics) |
| `missingMains` | optional; non-seasoning missing for UI emphasis |

**Scoring:**

```text
score = matched.length
      + (cookable ? 100 : 0)
      + (conditionally_cookable ? 50 : 0)
```

`matchScore` display percent stays ingredient-coverage based (do **not** use sort score as %).

**Aggregates in tool content:**

```json
{
  "suggestions": [ /* … */ ],
  "cookableCount": N,
  "conditionallyCookableCount": M,
  "assumeBasicSeasonings": true
}
```

**Card (`meal_suggestions`):** extend each suggestion with `cookStatus` (+ optional `conditionalSeasonings`) so UI can badge “條件式可煮” without relying on LLM prose alone.

### 2.5 System prompt

- Prefer `cookable`, then mention `conditionally_cookable` with 「若家裡有 …」.
- Never say “可以直接煮 / 完全可煮” for conditional-only.
- When toggle OFF (from preferences), treat all missing equally.
- Still call `getPreferences` before suggest when diet/allergies matter; also read `assumeBasicSeasonings`.

### 2.6 Soft-reserve / shopping (explicit v1 boundary)

Seasoning assumption affects **suggest classification + chat narrative only**. Soft-reserve, confirm deduct, and shopping hints continue to treat missing seasonings as real shortages unless a later feature expands scope.

---

## 3. Phase B — Unit conversion round-trip

### 3.1 Schema

```sql
CREATE TABLE IF NOT EXISTS unit_conversion_table (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  item_name TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  target_unit TEXT NOT NULL,
  ratio REAL NOT NULL, -- 1 base_unit = ratio target_unit
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE(user_id, item_name, base_unit, target_unit)
);
```

- `ratio > 0` enforced in API.
- Lookup: normalize `item_name`; match `(base,target)` or inverse (`qty_target = qty_base * ratio`, `qty_base = qty_target / ratio`).

### 3.2 Unit-aware missing detection (suggest path)

For each recipe ingredient vs pantry rows of same normalized name:

1. If units equal (normalize) → current qty compare.
2. Else if conversion row exists → convert pantry available into recipe unit (or vice versa) then compare.
3. Else → treat as **unit_mismatch** for that ingredient:
   - Do not count as matched quantity.
   - Add to `unitMismatches[]` / emit `define_unit` action.
   - Ingredient also contributes to `missing` (cannot prove sufficiency).

Multiple mismatches → one action per distinct `(item, from_unit, to_unit)` (cap e.g. 5 per suggest response).

### 3.3 Action emission

Prefer **structured card**, not only LLM-invented JSON:

```ts
// ToolExecResult addition when mismatches exist
cardType: // either nest under meal_suggestions or separate event
cardData: {
  suggestions: [...],
  actions: [
    {
      action_required: 'define_unit',
      item: '排骨',
      from_unit: '包',
      to_unit: 'g',
    },
  ],
}
```

Aggregate-card rules: if only suggest (read tool), existing non-mutating last-card path already surfaces `meal_suggestions`. Nest `actions[]` inside that card so clients need one renderer update. Alternative: new card type `define_unit` as sibling event — pick **nested `actions[]` on `meal_suggestions`** for v1 (single bubble).

Agent content JSON should mirror `actions` so the model can mention the convert ask without inventing units.

### 3.4 API / write path

| Option | Choice for v1 |
|--------|----------------|
| REST | `POST /api/unit-conversions` (auth user) upsert ratio |
| Agent tool | Optional `setUnitConversion` (HITL or trusted UI-only write) |

**Recommended:** REST (or domain route) called by the chat card on Confirm — same auth as other CRUD. Optionally also expose a small tool for text-only users (“1包排骨500克”).

After success, client appends **hidden user/system context** to the next chat turn, e.g.:

```text
[context] User defined unit conversion: 1 包 排骨 = 500 g. Re-run suggestMealsFromPantry and update cookability.
```

Chat pipeline should treat this as a normal user turn that triggers tools (no special server flag required if prompt already says to honor conversion context). Prefer a dedicated client flag `hidden: true` so UI does not show the meta line.

### 3.5 Frontend card UX

```text
┌─────────────────────────────────────────┐
│ 設定單位換算                              │
│ 1 [包] 排骨 = [____] g     [確認]         │
└─────────────────────────────────────────┘
```

- Pre-fill units from action payload; user only types number.
- Disable confirm until `ratio > 0`.
- On success: toast/card state “已儲存”; trigger hidden re-suggest turn; replace or append updated `meal_suggestions`.

### 3.6 Prompt

Keep: do not invent conversions. Add: when `actions` contain `define_unit`, point user to the card; after conversion context, call `suggestMealsFromPantry` again.

---

## 4. Business logic flows

### 4.1 Phase A suggest

```text
prefs = get assumeBasicSeasonings (default true)
available = soft-reserve pool
for recipe:
  matched, missing = compare(available, ingredients)  // + unit rules if Phase B shipped
  cookStatus = classify(missing, prefs)
  score = …
sort; take top 8
return content + meal_suggestions card
```

### 4.2 Phase B define-unit

```text
suggest detects mismatch → actions[]
UI confirm → upsert unit_conversion_table
hidden context → agent → suggestMealsFromPantry
convert uses ratio → may become cookable / conditional / still short
```

---

## 5. Edge cases & errors

| Case | Handling |
|------|----------|
| `ratio ≤ 0` / NaN | 400; card stays open |
| Duplicate upsert | Update `ratio` + `updated_at` |
| Seasoning name not exact (生抽) | Not in DEFAULT unless normalize maps it — document; no silent alias expand in v1 |
| Conditional + unit mismatch on main | `uncookable` or mismatch action takes precedence for that ingredient |
| Allergies include 蒜 | Recipe with 蒜 required: still blocked by preference/allergy path before “conditional OK” marketing |
| Toggle mid-session | Next suggest reads fresh prefs |

---

## 6. Performance & security

- Suggest already loads recipes + ingredients; conversion lookup: one query `WHERE user_id = ?` → in-memory map (users rarely have many rows).
- `unit_conversion_table` and preferences scoped by `user_id`; no cross-user reads.
- Hidden context must not escalate privileges; same chat auth.

---

## 7. Test plan (maps to feature oracles)

### Vitest (backend)

| Test | Assert |
|------|--------|
| A1 seasoning-only | `cookStatus === 'conditionally_cookable'`, `conditionalSeasonings` includes 醬油/糖, `cookable === false` |
| A2 main+salt | `uncookable`; `missingMains` includes 山藥 |
| A3 toggle off | same pantry/recipe as A1 → not conditional; missing includes seasonings |
| B1 no ratio | `actions` has `define_unit` for 排骨 包→g |
| B2 after ratio | available converted; cookable or qty-short as math dictates |
| Scoring | cookable sorts above conditional above short-with-overlap |

### Prompt / contract

- System prompt mentions conditional phrasing + define_unit card.
- Existing cookable ranking tests updated for new fields; fail-first where status changes.

### Manual

- Settings toggle OFF → chat re-ask → strict list.
- Define-unit card submit → suggestions refresh without retyping 「可以煮什麼」.

---

## 8. File touch map (expected)

| Area | Files (indicative) |
|------|---------------------|
| Constants + classify | `backend-cf/src/agent/tools/seasonings.ts` (new) |
| Suggest execute | `execute.ts`, `execute-suggest-cookable.test.ts` |
| Cards | `cards.ts` + web/mobile meal suggestion renderers |
| Prefs | migration, `preferences.ts`, Settings UI |
| Conversions | migration, `db/unit-conversions.ts`, route, card |
| Prompt | `system-prompt.ts` (+ test) |

---

## 9. Open decisions (locked for v1 unless user overrides)

| # | Decision | Locked |
|---|----------|--------|
| 1 | Seasonings list | Exact array from product spec (incl. 蒜/薑) |
| 2 | Custom list in Settings | Deferred |
| 3 | Soft-reserve ignores seasoning assumption | Yes (suggest-only) |
| 4 | define_unit delivery | Nested `actions[]` on `meal_suggestions` |
| 5 | Persist API | Authenticated upsert route; optional agent tool later |
| 6 | Feature epic name | `flexible-cookable-suggestions` |
