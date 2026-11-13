# Bug: Scheduled meals card shows blank names (路路)

**Status:** Resolved  
**Severity:** Major  
**Type:** Contract mismatch (card payload vs UI)  
**Surface:** Chat `meal_plan_updated` card

---

## Current behavior

?淪cheduled 7 meal(s)??lists rows as blank 路 blank 路 blank (`路路`).

## Expected behavior

Each row shows meal name, meal type, and serving date.

## Reproduction

1. Approve a multi-day `planMeals` HITL.  
2. View the meal_plan_updated card meal list.

## Related files

- `backend-cf/src/agent/tools/cards.ts` (`mealPlanUpdatedCardData`)
- `frontend/src/components/AICookingAssistant.tsx`

## Impact

Users cannot verify what was scheduled from the chat card.
