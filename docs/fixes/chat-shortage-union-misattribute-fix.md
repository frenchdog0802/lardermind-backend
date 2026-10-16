# Fix Design: Chat shortage answer mixes meals and misattributes ingredients

**Bug:** `docs/bugs/chat-shortage-union-misattribute.md`  
**RCA:** `docs/rca/chat-shortage-union-misattribute-rca.md`  

---

## Fix Approach

Smallest fix that makes per-meal shortages self-describing and locks chat presentation order:

1. **Enrich `MealAvailabilityEntry`** (additive, backward compatible) with fields already on the meal plan row:
   - `serving_date` (`YYYY-MM-DD`)
   - `meal_name`
   - `meal_type`
   - Optionally `recipe_id` (empty string / omit when null — prefer include as `recipe_id: string | null` for clarity)

   Populate in every `meals.push(...)` path inside `computeWeekAvailability` (ok / short / unknown / inactive).

2. **System prompt — Shortages → shopping**  
   Replace aggregate-first wording with:
   - When answering 「缺什麼」 / shortages, **must** use `meals[]`: for each meal with `status === 'short'`, list that meal’s `serving_date`, `meal_name`, and its `shortages` only.
   - Do **not** put meal A’s shortages under meal B’s heading.
   - Do **not** invent doubt that shortages “belong to another dish” — if another meal is short, list it under its own heading.
   - `weekShortages` / `shoppingHints` are a **deduped buy list** for an optional shopping offer **after** the per-meal breakdown (or when the user asks for one combined cart).
   - For `status === 'unknown'`, say that meal cannot be scored (no recipe), do not fabricate ingredients.

3. **Tool description nudge** on `getMealPlanAvailability`: return per-meal labeled status + shortages; `weekShortages`/`shoppingHints` are aggregated for shopping only — narrate per-meal first.

No D1 migration. No new chat card type in this fix (prose contract only). Calendar HTTP API gains the same additive fields (harmless for clients that ignore extras).

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Prompt-only (“always call listMealPlans and join”) | Fragile; model still mis-joins; unlabeled rows remain |
| Remove `weekShortages` from tool output | Breaks shoppingHints / calendar week CTA contract |
| Dedicated `meal_shortages` chat card | Better UX later; larger client scope; not required to fix attribution |
| Server-side rewrite of assistant text | Not how chat tools work; fix data + prompt |

## Scope of Change

- `backend-cf/src/db/meal-plan.ts` — type + `computeWeekAvailability` population
- `backend-cf/src/agent/system-prompt.ts` (+ test assertions)
- `backend-cf/src/agent/tools/definitions.ts` — tool description
- `docs/design/web-calendar-hub-design.md` — document enriched `meals[]` fields (brief)
- Tests: availability entry labels; system-prompt shortage rules
- Mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Revert entry enrichment + prompt/tool wording. Clients that started reading new fields still tolerate absences if rolled back carefully; additive fields only.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Larger tool JSON tokens | Few strings per meal; ranges are week-sized |
| Clients assuming exact meal shape | Additive fields only |
| Model still dumps weekShortages first | Explicit prompt order + tool description; covered by prompt unit test |

## Regression Test Plan

1. **Vitest (fail-first):** With two planned meals in range and short pantry, `computeWeekAvailability` (or tool execute / HTTP) returns each meal entry with correct `serving_date` + `meal_name` and meal-specific shortages (A’s ingredients not required under B’s entry).
2. **Vitest:** `buildCookingAssistantSystemPrompt` requires per-meal shortage presentation and forbids inventing cross-dish doubt; week list only after / for shopping offer.
3. **Existing:** `domain-crud` availability + soft-reserve tests still pass.
4. **Manual:** Multi-dish calendar → 「還缺什麼食材」 → headings match dates/names; no “看起來像另一道菜” apology under the wrong soup.

## Confirmation that root cause is fixed

Tool output labels each meal’s shortages; prompt requires narrating those labeled rows first. Misattribution and self-contradictory “wrong dish” copy should no longer be the default path.
