# RCA: side dishes dropped / empty-name meal_plans row

## Confirmed
1. **Side dishes:** `meal_plans` has no unique key on (user, serving_date, meal_type) and `planMeals` accepts any number of entries per slot, so multiple dishes per slot ARE supported by the backend. The model collapsed its proposal to the 3 recipes it had just created and emitted one `planMeals` entry per day, rotating them. Nothing in the system prompt or tool description told it to emit one entry per proposed dish, forbade rotation/substitution, or said name-only sides are allowed; the prompt even said to "warn" on same-slot duplicates, which discourages main + side. Nothing server-side reported what was saved vs proposed.
2. **Empty name:** `createMealPlan` stored `input.meal_name ?? ''`, and `parseCreateInput` (POST /api/meal-plan) and `addRecipeToMenu` (stale recipe_id -> id dropped, name empty) both allowed a blank name with only a recipe_id. `planMeals` itself rejects blank names, so the stray row came from a non-planMeals insert path (REST POST or addRecipeToMenu). Which one fired in prod cannot be determined from this repo (no request logs / mobile client here).

## Not confirmed
Why the Calendar UI showed one dish on 11/19 (client code is not in this repo).
