# Phase 4 (outline): Cookable recipes under reserve

**Status:** Outline only — expand after Phase 2 (needs available pool).  
**Do not code yet.**

## Intent

Suggestions prefer recipes that fit **available** stock (on_hand minus soft reserves), not raw on_hand ignoring the week’s plans.

## Likely work

1. Shared cookable/score helper using the same virtual pool as availability.
2. Wire into `suggestMealsFromPantry`.
3. Optional: plan helpers disclose low variety when few recipes match.

## Exit criteria

- [ ] Concrete tasks exist
- [ ] Suggest path respects soft reserve
