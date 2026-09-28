# Task 03: Stripe client + entitlement helpers

**Phase:** 1 — Data & config  
**Depends on:** 01, 02

## Goal

Shared libraries: Stripe SDK factory, config check, D1 subscription access, `isEntitled`.

## Work

1. Add `stripe` dependency to `backend-cf` (Workers-compatible usage).
2. `src/lib/stripe.ts`: `getStripe(env)`, `stripeConfigured(env)`, `priceIdFor(env, billingPeriod)`.
3. `src/lib/entitlement.ts`: `isEntitled(status)`, `resolveEntitlement(db, userId, role?)`.
4. `src/db/subscriptions.ts`: get by userId / customerId / subscriptionId; upsert from Stripe-shaped input; ensure customer placeholder row.

## Acceptance

- [ ] Unit tests for `isEntitled` matrix (`active|trialing|past_due` true; others false)
- [ ] `stripeConfigured` false if any required field missing
- [ ] No HTTP routes yet

## Notes

Prefer thin wrappers; keep Stripe types localized.
