# RCA: Plan “Usage this period” stays at 0

**Bug:** `docs/bugs/plan-usage-not-updating.md`  
**Status:** Confirmed via code inspection — fixed per fix design  

### C. Settings / Subscription keep-alive stale fetch (secondary UI)

`SubscriptionPanel` loaded usage once on mount. App keep-alive keeps Settings / Subscription mounted while the user chats elsewhere, so returning to Your plan could still show the first fetch (often `0`) even after logged-in turns incremented quota.

---

## Root Cause

Two independent defects produce the same UI symptom (zeros on the plan page):

### A. Guest claim drops AI (and image) usage — primary for “I sent messages”

`claimGuestKitchen` reassigns `ai_messages` / sessions to the real user, then **`DELETE FROM usage_quotas WHERE user_id = guest`** with **no merge** into the real user’s quota row.

Design (`first-win-bootstrap-design`) requires **usage_quotas merge**. Implementation only deletes the guest row. Real users are created with `ai_message_sent = 0`, so after claim-on-signup the plan page correctly reads **0** while chat history shows the guest turns.

Logged-in chat itself does call `checkAndIncrementAiMessage` in `runAgentTurn`; that path is fine when the same user id owns both chat and status.

### B. Status API hardcodes recipe fields

`GET /api/subscription/status` returns:

```ts
recipeImportsUsed: 0, // stub — imports not tracked in schema
recipeCount: 0,       // always zero; never counts `recipes`
```

So **Recipes saved** never moves even when the user has recipes. **Recipe imports** cannot move until a counter exists (feature explicitly “not enforced” in Stripe subscription docs).

## Contributing Factors

1. Claim path optimized for unique prefs/quota uniqueness (“drop guest if real already has one”) without summing period counters.
2. Status endpoint shipped limits for marketing copy before wiring used counts for recipes/imports.
3. Dead helper `incrementAiUsage` in `chat.ts` is unused; live path is `checkAndIncrementAiMessage` — easy to misread when debugging.

## Affected Components

| Component | Role |
|-----------|------|
| `db/guests.ts` `claimGuestKitchen` | Drops guest quota |
| `routes/subscription.ts` status | Hardcoded recipe usage |
| `SubscriptionPanel.tsx` | Displays API usage as-is |
| `db/quotas.ts` | Correct read/increment when row belongs to status user |

## Data / State Impact

Historical claims already lost guest `ai_message_sent` / `image_uploads` (not recoverable without replaying message timestamps). No schema corruption. Optional backfill: count today’s user-role `ai_messages` — out of scope for minimal fix unless product asks.

## Timeline

- Claim delete-without-merge: since first-win guest claim landed.
- Hardcoded `recipeCount` / `recipeImportsUsed`: since web Stripe subscription status task.

## Why it wasn't caught earlier

- Acceptance likely checked logged-in chat quota enforcement (403 at limit), not Settings after guest→signup.
- No test asserting claim merges `usage_quotas` or status returns non-zero `recipeCount`.
