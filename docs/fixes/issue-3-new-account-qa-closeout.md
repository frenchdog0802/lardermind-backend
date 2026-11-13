# Closeout: New-account QA (issue #3) — Jack Jack Nov 10

Pasteable summary for [lardermind-backend#3](https://github.com/frenchdog0802/lardermind-backend/issues/3):

## Must-fix

1. Pantry unit merge + ingredient catalog load — `pantry-unit-dropped-on-merge`
2. AI update → `updateRecipe` + same-name create guard — `chat-recipe-update-duplicates`
3. Preserve cups/tbsp units — `chat-recipe-unit-coercion`
4. Recipes saved count from D1 — `plan-usage-not-updating`
5. Meal plan card camelCase names — `meal-plan-card-blank-names`
6. “no tool was started” soft-fail — `mutation-no-tool-false-positive`

## Should-fix

See `issue-2-and-3-should-fix-closeout.md` (HITL Applying…, auto-title after HITL, calendar names/expand, Save recipe, setup guide retirement, password rules, trial copy).

## Copy decision

Trial starts when upgrading to Pro (Stripe), not auto on signup — `pre-launch-entitlement-messaging`.
