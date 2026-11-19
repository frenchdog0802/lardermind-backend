# Bug: Agent proposes 2 dishes/day but only 1 is scheduled; empty-name ghost meal_plans row

**Status:** Resolved  
**RCA:** `docs/rca/meal-plan-side-dishes-dropped-rca.md`  
**Fix design:** `docs/fixes/meal-plan-side-dishes-dropped-fix.md`

## Current Behavior
Prod (2026-11-19, zh-TW chat): assistant proposed a 5-day dinner plan with a main + a side per day, offered "create 3 recipes and schedule the five dinners"; after approval it called createRecipe x3 then planMeals with 5 rows, one recipe per day, rotating the 3 recipes (Sat/Sun/Mon changed). All sides vanished. Separately a `meal_plans` row with `meal_name = ''` (recipe_id of 排骨炒時蔬, 2026-11-19 dinner) was inserted ~3 s before the planMeals rows.

## Expected Behavior
Every dish the assistant proposed is saved on the day it proposed (several rows per date + meal_type); any deviation is stated. No meal_plans row is ever saved with an empty name.

## Impact
Calendar disagrees with the proposal; the hidden blank row still counts toward shortages (plan resolution uses recipe_id).
