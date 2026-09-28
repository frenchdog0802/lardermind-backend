# Task 02: Env — Stripe secrets and price vars

**Phase:** 1 — Data & config  
**Depends on:** none (can parallel 01)

## Goal

Type and document all Stripe configuration; safe when unset.

## Work

1. Extend `backend-cf/src/env.ts`:
   - `STRIPE_SECRET_KEY?: string`
   - `STRIPE_WEBHOOK_SECRET?: string`
   - `STRIPE_PRICE_MONTHLY?: string`
   - `STRIPE_PRICE_YEARLY?: string`
2. Update `.dev.vars.example` with empty placeholders.
3. Comment `wrangler.toml` secrets/vars list (do not commit real secrets).
4. Document required Dashboard setup in a short comment or leave for task 13.

## Acceptance

- [ ] Types compile with vars optional
- [ ] Example env files updated
- [ ] No real keys committed

## Notes

`stripeCheckoutEnabled` logic lands in task 03/04.
