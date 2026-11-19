# AI chat flow hardening (2026-11)

**Status:** Fixed on branch `feat/ai-flow-hardening` (not deployed)
**Severity:** High (the assistant claimed writes that never happened)
**Type:** Agent / prompt / validation / data integrity
**Surface:** `backend-cf` chat agent and `/api/meal-plan`

---

## What went wrong

The user asked for a 5-day dinner plan with a main dish **plus** a vegetable side each day. The assistant proposed that plan. The user replied "A: create 3 new recipes then schedule the five dinners". Then:

- `planMeals` got **one** dish per day. The sides were never scheduled and some dishes were repeated.
- The assistant still said everything was scheduled.
- A meal-plan row with an **empty name** appeared. Its source was the chat recipe card's "add to today's dinner" button: it posts only `recipe_id`, `POST /api/meal-plan` did not fill in the name, and `createMealPlan` stored `''`. `PUT` also accepted `''`.

Root causes in the agent:

- The prompt contradicted itself. One rule said "propose, then ask"; another said "createRecipe then planMeals in the same turn". Another rule discouraged putting several dishes in one slot. The prompt also named the wrong shopping tool, and some wording pushed the model toward claiming success.
- The `planMeals` result gave no ledger the model could check.
- The approval card said only "N meals (range)", so the user could not see which dishes would be written.
- Tool arguments were validated only **after** the user clicked Approve.
- The reply language came from "the latest message", which fails for short replies like "A" or "ok". Some server strings were hard-coded: the approval message was always English and the remove summary was always 「刪除」.

## What changed

1. **No nameless meal plans** (`db/meal-plan.ts`, `routes/meal-plan.ts`, `agent/tools/execute.ts`)
   - `createMealPlan`: if `meal_name` is empty or whitespace, the name is taken from the user's own recipe (`recipe_id`, looked up for that user only). If there is still no name, it throws `MealPlanValidationError`.
   - `updateMealPlan`: if the request explicitly sends a blank `meal_name`, the name is resolved the same way or the update is rejected. Patches that don't send `meal_name` leave the row as stored, so old nameless rows are not rewritten. No data migration.
   - `POST` / `PUT /api/meal-plan` return **400** `{ success: false, code: "validation_error", message: "meal_name is required (or pass the recipe_id of one of your recipes)" }`.
   - The `addRecipeToMenu` tool returns a tool error instead of writing `''`. `planMeals` already rejected empty names and still does, per entry.
2. **Truthful `planMeals` result and approval card**
   - Every existing tool-result field is kept (`created` [rows], `errors`, `truncated`, `note`). New fields: `requested`, `createdCount`, `byDate`, `existingInSlot`, plus `notSaved` and `warning` when fewer meals were saved than requested.
   - Card data keeps `mealsScheduled`, `meals`, `mealPlanId`, `recipeName`, `mealType` and `servingDate`, and adds `mealsRequested` and `byDate`.
   - The approval `argsSummary` (still a plain string) starts with the old `N meals (span)` text and then lists date → dish names, e.g. `10 meals (2026-11-23…2026-11-27): 2026-11-23 Braised Pork, Garlic Spinach; …`. It shows the first 12 dishes, then `+N more`. When a call mixes meal types, each group is prefixed with its meal type.
3. **System prompt rewrite and reply language** (`agent/system-prompt.ts`, `agent/language.ts`, `tools/definitions.ts`)
   - The prompt is now in priority order: language, truthfulness, planning contract, approval behaviour, empty-kitchen policy, and a dynamic calendar + language tail.
   - New rules R1–R5:
     - R1: a slot can hold several dishes, and each dish is its own entry.
     - R2: only claim what is in `created` / `byDate`.
     - R3: re-read the proposal before calling `planMeals`.
     - R4: never drop or substitute dishes. "Create N recipes" does not limit the plan to N dishes.
     - R5: each option restates its full day-by-day list.
   - Contradictions removed:
     - Propose with the full list, get confirmation, then create recipes and call `planMeals` for all dishes in one go.
     - Plan shortages use `addMealPlanShortagesToShoppingList`. `addItemsToShoppingList` is only for ad-hoc items.
     - The redundant "Orchestration" list is deleted.
   - Shortage narration and `define_unit` detail moved into tool descriptions.
   - Prompt size went from 13,228 to 10,341 bytes (static prefix 12,693 → 10,001). The tool definitions grew from 10,086 to 12,125 bytes (moved detail plus the new schema constraints), so prompt plus tools together went from about 23.3 KB to 22.5 KB.
   - Language: the final prompt line is `Reply language: <Traditional Chinese|English>. Keep tool argument names/units in the same language.`. It sits in the tail, so the static prefix is byte-identical for prompt caching. The approval message, the pending reminder and the HITL summaries are now localised (`zh` / `en`).
4. **Tool arguments validated before the approval card** (`agent/agent-loop.ts`, `tools/validate-args.ts`)
   - Mutating calls are validated after unit normalisation, both in the main loop and in the post-approval continuation.
   - An invalid call gets an `invalid_arguments` tool result, and the model retries within the round budget. **No interrupt is stored.** Valid mutating calls in the same batch are skipped and must be re-sent with the fix.
   - Resume-time validation is kept as a safety net.
   - New constraints:
     - names must not be empty (after trimming)
     - `serving_date` and the from/to ranges must be `YYYY-MM-DD`
     - `meal_type` must be in the enum
     - arrays need `minItems: 1`
     - `planMeals` has `maxItems: 28`, with a message that matches the executor's cap
     - pantry and shopping quantities must be `> 0`
     - `addRecipeToMenu` needs `recipe_id` or `meal_name`

## API additions (all optional / additive)

- `POST /api/chat/send`, `POST /api/chat/stream`, `POST /api/chat/resume`: new optional body field `language` (string, max 35 characters).
  - `zh`, `zh-TW`, `zh-CN`, `zh_Hant` etc. mean Traditional Chinese.
  - `en`, `en-US`, `en_GB` etc. mean English.
  - Any other value is ignored; it does not cause an error.
  - When the field is absent, the server detects the language from the most recent user message with at least 4 letters or CJK characters. Short replies (`A`, `ok`, `好`) fall back to earlier user messages. The default is English.
  - The detected language is stored on the pending interrupt and used when the action is resumed.
- `planMeals` tool result: adds `requested`, `createdCount`, `byDate` (`{ [date]: { [meal_type]: string[] } }`), `existingInSlot` (same shape: active meals already in the touched slots before the call), and `notSaved` / `warning` on partial saves. `created` is still the array of created rows; the count is the new `createdCount`.
- `meal_plan_updated` card data from `planMeals`: adds `mealsRequested` and `byDate`.
- `/api/meal-plan` `POST` / `PUT`: new 400 `validation_error` when no name can be resolved. Before, this request returned 201/200 and stored an empty name.

Older mobile builds send no `language` and read only the existing fields, so they keep working. Their approval summaries now include dish names, and English chats now see `remove X` instead of `刪除 X`.

## How to verify on staging

1. Deploy the branch to staging (`npm run deploy:staging`, owner only). Sign in as a test user with an empty calendar.
2. Send: `Plan 5 dinners for next week; each day a main dish plus a vegetable side.`
   - Expect a full day-by-day list with both dishes for every day. If options are offered, each option should restate its full list.
3. Reply: `A: create 3 new recipes then schedule the five dinners`.
   - Approve the createRecipe card. Expect a **planMeals** approval card that lists all 10 dishes by date.
   - Approve it. Expect the reply to say that 10 dishes were scheduled. The Calendar should show two dinner dishes on each of the 5 days, with no repeats and no empty names.
4. Repeat steps 2–3 in Chinese (「幫我規劃下週五天晚餐，每天一道主菜加一道青菜」, then reply 「A」). Expect Chinese replies, Chinese approval text, and `刪除 …` style summaries.
5. Tap the chat recipe card's "add to today's dinner". The new row should carry the recipe's name.
6. Send `POST /api/meal-plan` with `{"meal_type":"dinner","serving_date":"2026-11-23"}` and no name or recipe. Expect 400 `validation_error`.
7. Ask for a dinner on an existing slot. The reply should mention the meal already there (`existingInSlot`) rather than silently adding a duplicate.

## Known limits

- **The model's behaviour change from the prompt rewrite can only be confirmed with live runs on staging.**
  - The tests pin the prompt text, the ledger, validation and the server flow with a scripted fake LLM.
  - They cannot prove that `deepseek-chat` now follows R1–R5. Run the scenario above several times, in both languages.
- The new JSON Schema keywords (`minLength`, `pattern`, `minItems`, `maxItems`, `exclusiveMinimum`) are sent to the provider in the tool schemas. Watch for provider errors on the first staging run.
- `existingInSlot` counts all non-skipped rows in the slot, including confirmed (cooked) meals.
- Old nameless rows already in the database are left untouched.
- Language detection is a heuristic. A mixed message counts as Chinese when (CJK chars × 3) ≥ Latin letters.
- Clients should send `language` from their UI locale for best results.
- A pending approval created before this deploy has no stored language. Its language is detected from its messages.
