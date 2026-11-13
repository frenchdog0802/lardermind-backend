# Bug: Plan “Usage this period” stays at 0 after chat / kitchen activity

**Status:** Resolved  
**Severity:** Major  
**Type:** Logic / data merge + incomplete status API  
**Surface:** Settings → Your plan (`SubscriptionPanel`); `GET /api/subscription/status`

---

## Current behavior

Logged-in Free users see Usage this period with counters stuck at zero, e.g.:

- AI messages today: `0 / 20`
- Recipe imports this month: `0 / 3`
- Recipes saved: `0 / 50`
- Image uploads this month: `0 / 10`

Reporter entered AI chat messages; AI messages (and other rows) did not update.

## Expected behavior

- **AI messages today** reflects `usage_quotas.ai_message_sent` for the current UTC day (including usage earned as guest after claim-on-signup).
- **Recipes saved** reflects the user’s current recipe row count.
- **Image uploads** already reads `usage_quotas` (should remain correct when uploads happened on this account).
- **Recipe imports** — product has no import counter yet (v1 not enforced); UI may stay `0` until tracking exists (document, do not fake).

## Reproduction

1. Landing guest chat: send one or more real AI messages (quota increments on guest `usage_quotas`).
2. Sign up / sign in so guest kitchen is claimed onto the real user.
3. Open Settings → Your plan.
4. Observe **AI messages today** still `0 / 20` despite transferred `ai_messages` history.

Alternate (recipes row): create recipes while logged in → **Recipes saved** still `0 / 50`.

## Related files

- `backend-cf/src/db/guests.ts` (`claimGuestKitchen` — now merges via `mergeGuestUsageIntoRealUser`)
- `backend-cf/src/db/quotas.ts` (`mergeGuestUsageIntoRealUser`, `getAiUsageForStatus`)
- `backend-cf/src/db/recipe.ts` (`countRecipes`)
- `backend-cf/src/routes/subscription.ts` (wires `recipeCount`; imports still stub `0`)
- `frontend/src/components/SubscriptionPanel.tsx` (+ `Settings` / `SubscriptionView` / `App` `active` refetch)
- `docs/design/first-win-bootstrap-design.md` (requires usage_quotas **merge** on claim)

## Impact

Free-tier users cannot see real usage after guest first-win → signup. Plan page understates AI usage (and always understates recipe count). Undermines upgrade urgency and quota transparency.

## Environment

Web Settings / subscription status (prod or local). Reporter screenshot: Free plan, all four usage rows at 0.
