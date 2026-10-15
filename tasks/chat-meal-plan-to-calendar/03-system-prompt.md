# Task 03: System prompt — Calendar offer

**Depends on:** 01 (tool must exist for the prompt to name it)  
**Repo:** `backend-cf/`

## Goal

Teach the assistant to offer Calendar writes after multi-day plans and to call `planMeals` on confirm.

## Work

1. Extend `COOKING_ASSISTANT_SYSTEM_PROMPT` per design §2 (offer after multi-day plan; confirm → `planMeals`; single slot → `addRecipeToMenu`; never claim save without tool).

## Acceptance

- [ ] Prompt text mentions Calendar / 行事曆 offer and `planMeals`
- [ ] Existing “never claim write without tool” rules remain

## Test

Source assert or snapshot string contains key phrases (lightweight).
