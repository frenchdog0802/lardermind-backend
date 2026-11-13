# Fix Design: Plan “Usage this period” stays at 0

**Bug:** `docs/bugs/plan-usage-not-updating.md`  
**RCA:** `docs/rca/plan-usage-not-updating-rca.md`  

---

## Fix Approach

1. **Merge `usage_quotas` on guest claim** (align with first-win design):
   - Load guest + real quota rows.
   - For AI: current UTC day counts = sum of each row’s `ai_message_sent` if that row’s `ai_period_start >= startOfUtcDay(now)`, else 0 for that side.
   - For images: same with UTC month / `image_uploads` / `image_period_start`.
   - `UPDATE` real user’s row with merged counts + current period starts; `DELETE` guest quota (keep uniqueness).
   - If real has no quota row (edge): reassign guest row `user_id` → real, or insert merged row.

2. **`recipeCount` from D1:** add `countRecipes(db, userId)` and return it from `/api/subscription/status`.

3. **`recipeImportsUsed`:** leave `0` for now (no column / no enforcement). Do not invent a number. Optional UI follow-up: hide or label “coming soon” — out of this fix unless product asks.

4. **Frontend keep-alive refresh:** pass `active` from `App` → `Settings` / `SubscriptionView` → `SubscriptionPanel`; refetch status whenever the view becomes visible again (chat → plan no longer shows a stale 0).

## Alternatives Considered

| Option | Why rejected |
|--------|----------------|
| Backfill AI used from `COUNT(ai_messages)` today | Wrong semantics (every role msg ≠ charged turn); messy; doesn’t fix claim going forward |
| Only document “refresh after login chat” | Ignores confirmed claim bug |
| Add recipe-import counter schema now | Larger than needed; feature not enforced in v1 |

## Scope of Change

- `backend-cf/src/db/guests.ts` — merge helper + claim path
- `backend-cf/src/db/quotas.ts` — `mergeGuestUsageIntoRealUser`
- `backend-cf/src/db/recipe.ts` — `countRecipes`
- `backend-cf/src/routes/subscription.ts` — wire `recipeCount`
- `frontend` — `SubscriptionPanel` / `Settings` / `SubscriptionView` / `App` `active` refetch
- Tests: claim merge; `countRecipes`
- Docs: bug → Resolved

## Data Migration / Backfill

None required for ship. Historical lost guest counters stay lost.

## Rollback Plan

Revert claim merge + `countRecipes` wiring. Status again drops guest usage / hardcodes recipe count.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Double-count if claim called twice | Claim deletes guest user; second claim fails “Guest not found” |
| Sum exceeds daily limit after merge | Next `checkAndIncrementAiMessage` enforces; display may show N≥limit until next day — acceptable |
| Missing image columns on old local DBs | Migrations already add columns; use COALESCE 0 |

## Regression Test Plan

1. Failing-then-passing: guest with `ai_message_sent=3` same UTC day → claim → real `getAiUsageForStatus.used === 3` (plus any prior real same-day count).
2. `countRecipes` / status path returns non-zero when recipes exist.
3. Existing guest claim tests still pass (prefs / table reassignment).
4. Quota increment + status read unit tests unchanged.

## Confirmation that root cause is fixed

After guest chat + claim, Settings AI messages matches charged guest turns for today. After creating recipes, Recipes saved matches DB count.
