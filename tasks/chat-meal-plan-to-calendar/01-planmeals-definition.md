# Task 01: `planMeals` definition + HITL / cards

**Depends on:** —  
**Repo:** `backend-cf/`

## Goal

Register `planMeals` as a mutating cooking tool with HITL summary and `meal_plan_updated` card mapping.

## Work

1. Add OpenAI function schema to `COOKING_TOOLS` per design (meals array; required meal_name, meal_type, serving_date; optional recipe_id).
2. Add `planMeals` to `MUTATING_TOOLS` and `argsSummary` (count + date span or compact list).
3. Map `planMeals` → `meal_plan_updated` in `TOOL_CARD_TYPES`.

## Acceptance

- [ ] `listToolNames()` includes `planMeals`
- [ ] `isMutatingTool('planMeals')` is true
- [ ] Unit test covers argsSummary for a multi-meal payload

## Test

`npm test` (or vitest filter) for hitl / definitions as appropriate.
