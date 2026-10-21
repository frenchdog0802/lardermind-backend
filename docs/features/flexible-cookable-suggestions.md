# Feature: Flexible cookable suggestions

**Status:** Implemented (Phases A–B)  
**Scope:** Soften “all-or-nothing” cookability with (1) **conditionally cookable** under a default basic-seasonings assumption, and (2) an interactive **unit-conversion** chat card that round-trips into a per-user conversion table and re-runs cookable evaluation.  
**Out of scope (v1):** User-editable custom seasoning lists in Settings (constant list only; toggle only); silent auto-convert without user confirm; Google/Apple calendar sync; redesign of meal_suggestions chrome beyond status + define-unit card; changing soft-reserve math.

**Design:** [flexible-cookable-suggestions-design.md](../design/flexible-cookable-suggestions-design.md)  
**Tasks:** [tasks/flexible-cookable-suggestions/](../../tasks/flexible-cookable-suggestions/)

**Depends on (shipped):** [kitchen-closed-loop](./kitchen-closed-loop.md) Phase 4 (`suggestMealsFromPantry` cookable scoring), [closed-loop-qa-hardening](./closed-loop-qa-hardening.md) decision #4 (unit mismatch: clarify or refuse — no silent 包↔g).

**Related UX pain:** Chat answers that only list pantry-matched recipes as “完全不能煮” when missing items are oil/salt/soy, and unit mismatch as plain text instead of an actionable control.

---

## 1. Summary

Today `suggestMealsFromPantry` is binary: `cookable === (missing.length === 0)`. Agent copy then sounds strict (“完全不能煮”), even when the only gaps are household staples, and unit mismatch (包↔g) is prompt-only text with high typing cost.

This feature adds two product layers that **fuse into the same suggest path**:

| Layer | Product outcome |
|-------|-----------------|
| **A — Default basic seasonings** | Third status: **conditionally cookable** when every missing item is in a system `DEFAULT_SEASONINGS` set and `assume_basic_seasonings` is ON. |
| **B — Unit conversion UI** | Structured `define_unit` action → chat input card → persist ratio → hidden re-eval context → refreshed cookable status. |

### Why now

- Clear-fridge / “現有食材可以煮什麼” feels brittle with one protein + common pantry staples.
- Closed-loop already forbids silent unit convert; interactive define-unit completes that contract for UX.

---

## 2. Phases

| Phase | Name | Status | Ships product change? |
|-------|------|--------|------------------------|
| **A** | Conditionally cookable + `assume_basic_seasonings` | **Done** | Yes (tool JSON, card fields, prompt, preferences toggle) |
| **B** | Unit conversion round-trip UI | **Done** | Yes (schema, API, chat card, re-suggest) |

Ship Phase A first; Phase B may land independently after A’s contracts are stable.

---

## 3. Requirements — Phase A (default basic seasonings)

### 3.1 Default list (system constant)

```text
DEFAULT_SEASONINGS = ['油', '鹽', '醬油', '糖', '白胡椒', '米酒', '蒜', '薑']
```

- Matching uses the same name normalization as pantry/recipe matching (case/trim/alias rules already in agent tools).
- v1: **not** user-editable. Future: Settings custom list (explicitly out of scope).

### 3.2 Toggle

- Preference flag: `assumeBasicSeasonings` (DB/API snake: `assume_basic_seasonings`), **default `true`**.
- Surface: Settings and/or chat chrome chip; both must read/write the same preference.
- Agent must call `getPreferences` (or receive flag on suggest) before applying the soft path — align with closed-loop “getPreferences before cookable suggest”.

### 3.3 Coexistence with `suggestMealsFromPantry`

After Required vs Available stock comparison yields **Missing Items**:

1. If `missing.length === 0` → **`cookable`** (unchanged).
2. Else if toggle ON **and** every missing item ∈ `DEFAULT_SEASONINGS` → **`conditionally_cookable`**.
3. Else → **`uncookable`** (hard short). When both staples and mains are missing, treat as uncookable; narrative emphasizes **non-seasoning** shortages (do not lead with “缺鹽” if 山藥 is also missing).

Ranking: prefer cookable > conditionally_cookable > uncookable (with pantry overlap). Conditionally cookable still appears in the suggestions list (not filtered out as “useless”).

Agent narrative (when conditional):  
「若家裡有 [缺少的調味料]，可以直接做 [食譜名稱]」.

### 3.4 Success criteria (Phase A)

- [x] Tool content exposes cook status suitable for LLM + card (see design).
- [x] Toggle OFF restores strict missing list (seasonings listed as missing).
- [x] Vitest covers: seasoning-only missing; main+seasoning missing; toggle OFF.
- [x] Prompt contract: never claim fully cookable when only conditionally cookable.

---

## 4. Requirements — Phase B (unit conversion UI)

### 4.1 Detect + emit action

When stock unit and recipe need unit cannot be converted with an existing user ratio (e.g. 包↔g):

- Do **not** silently convert (keep decision #4).
- Emit structured action (tool/card), e.g.:

```json
{
  "action_required": "define_unit",
  "item": "排骨",
  "from_unit": "包",
  "to_unit": "g"
}
```

### 4.2 Frontend card

Chat renders: `[ 1 包 排骨 = [number] g ] [確認]`.

### 4.3 Persist + re-eval

- Write `unit_conversion_table` (per user): `item_name`, `base_unit`, `target_unit`, `ratio`.
- Client sends a **hidden context message** (or dedicated resume payload): user set `1 包排骨 = N g`; please re-run cookable evaluation.
- Agent/tool re-runs `suggestMealsFromPantry` using the new ratio; UI refreshes cookable / conditional / short state.

### 4.4 Success criteria (Phase B)

- [x] No silent 包↔g without a stored ratio.
- [x] Define-unit card round-trip persists and is used on next suggest.
- [x] Vitest: mismatch → action; after ratio → cookable math uses converted qty.
- [ ] Manual: chat card submit → refreshed suggestions without user retyping the original ask.

---

## 5. Test cases (product oracles)

### Phase A

| ID | Setup | Expect |
|----|--------|--------|
| A1 | Pantry: 排骨; recipe: 排骨+醬油+糖; toggle ON | Conditionally cookable; copy mentions 醬油、糖 — not “完全不能煮” |
| A2 | Pantry: 排骨; recipe: 排骨+山藥+鹽; toggle ON | Uncookable; emphasize 缺山藥; do not lead with 缺鹽 |
| A3 | Same as A1; toggle OFF | Uncookable / missing includes 醬油、糖 |

### Phase B

| ID | Setup | Expect |
|----|--------|--------|
| B1 | Pantry 排骨 10包; recipe needs 排骨 500g; no ratio | `define_unit` action + card; no fake cookable |
| B2 | User sets 1包=500g; re-suggest | Conversion applied; cook status recomputed |
| B3 | Ratio exists but other mains missing | Still uncookable for those mains; unit action not required again for that pair |

---

## 6. Edge cases

| Case | Expected |
|------|----------|
| Empty pantry | No fake conditional recipes |
| Recipe ingredient name aliases (生抽 vs 醬油) | Only match if normalize/alias already equates; do not invent aliases in v1 beyond existing normalize |
| Toggle ON but missing 山藥+鹽 | Uncookable; main shortage wins |
| Allergy conflicts with a “seasoning” | Preferences/allergies still win — do not suggest recipes that violate allergies even if conditional |
| Invalid ratio (≤0, non-numeric) | Reject submit; keep pending define_unit |
| Bidirectional convert | Store one ratio; apply both directions when matching (base↔target) |

---

## 7. Non-goals

- Auto-assuming sugar/oil for **shopping** deductions or calendar soft-reserve (seasoning assumption is **suggest/narrative only** in v1 unless design explicitly extends).
- Replacing meal_suggestions card layout wholesale.
- Multi-item batch define-unit wizard.

---

## 8. References

- Design: [flexible-cookable-suggestions-design.md](../design/flexible-cookable-suggestions-design.md)  
- Parent cookable: [kitchen-closed-loop.md](./kitchen-closed-loop.md)  
- Unit policy: [closed-loop-qa-hardening.md](./closed-loop-qa-hardening.md) decision #4  
- Implementation touchpoints: `backend-cf/src/agent/tools/execute.ts` (`suggestMealsFromPantry`), `cards.ts`, `system-prompt.ts`, `db/preferences.ts`
