# RCA: Chat shortage answer mixes meals and misattributes ingredients

**Bug:** `docs/bugs/chat-shortage-union-misattribute.md`  
**Status:** Confirmed via code inspection + product screenshots  

---

## Root Cause

Two compounding defects in the chat shortage path:

### A. Per-meal availability rows lack human labels for the model

`computeWeekAvailability` returns `meals[]` with only:

- `meal_plan_id`
- `status`
- `shortages[]`

No `serving_date`, `meal_name`, or `meal_type`. The LLM must re-join IDs to `listMealPlans` (or memory of the thread) to know which dish a shortage belongs to. When join fails or is skipped, shortages are easy to paste under the wrong heading (e.g. 宮保雞丁 lines under 「山藥排骨湯」).

### B. System prompt steers the model toward the week union first

`COOKING_ASSISTANT_SYSTEM_PROMPT` Shortages section says: if `weekShortages` / `shoppingHints` are non-empty, tell the user and offer `addItemsToShoppingList`. Orchestration step 4 is “report soft-reserve / shortages” without requiring **per-meal** presentation.

`weekShortages` is an intentional **aggregate** (shopping convenience). Using it as the primary answer collapses “today’s dish vs later dishes” into one bag — matching the user’s “union without isolation” complaint. Self-contradictory prose (“looks like another dish”) is the model noticing the mismatch after dumping the wrong bag under one meal title.

## Contributing Factors

1. Tool description for `getMealPlanAvailability` highlights “aggregated shortages (for shopping)” without telling the model to narrate `meals[].shortages` by labeled meal first.
2. Allocation order is chronological; multiple active plans in range each contribute to `weekShortages`, so a multi-dish calendar always yields a mixed buy list at the aggregate layer.
3. Free-text / unknown recipes (`status: 'unknown'`) have empty shortages — model may fill gaps from training or other meals’ aggregate lines.
4. No structured shortage card in chat forces all attribution into free-form LLM text.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/db/meal-plan.ts` | `MealAvailabilityEntry` shape; `computeWeekAvailability` |
| `backend-cf/src/agent/tools/execute.ts` | Passes availability JSON to the model |
| `backend-cf/src/agent/tools/definitions.ts` | Tool wording |
| `backend-cf/src/agent/system-prompt.ts` | Shortage presentation rules |
| `GET /api/meal-plan/availability` | Same `meals[]` payload (calendar UI already has meal names elsewhere) |

## Data / State Impact

- No incorrect D1 writes from this bug alone.
- User-facing: wrong shopping suggestions if they Approve a mixed list; trust damage from self-contradictory assistant copy.

## Timeline

Introduced with kitchen closed-loop Phase 3 (`getMealPlanAvailability` + `shoppingHints` + prompt orchestration). Aggregate-first prompt + unlabeled `meals[]` shipped together.

## Why it wasn't caught earlier

- Unit/route tests assert `status` / `weekShortages` names, not that chat can attribute shortages without a second listMealPlans join.
- Manual happy path often has one short meal in range, so union ≈ that meal.
- Self-doubt copy is intermittent and was treated as model quirk rather than missing labels + prompt contract.

## Plausible alternatives (ranked)

1. **Confirmed (A+B):** Unlabeled per-meal rows + prompt emphasizes week union → misattribution and mixed answers.
2. Less likely sole cause: wrong shortages attached inside `allocateIngredientsAgainstPool` — allocation is per recipe ingredients against a shared pool; screenshots’ Kung-Pao-like lines still imply a real 宮保雞丁 (or similar) plan in range, not soup recipe corruption.
3. Unlikely: client UI remapping card data — observed wrong list is assistant prose, not a shortage card.
