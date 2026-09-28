# Task 04: Plans + status — real entitlement

**Phase:** 2 — API  
**Depends on:** 03

## Goal

Replace stub `isPro: false` with D1 entitlement; gate `stripeCheckoutEnabled` on config; fix Android product IDs.

## Work

1. Update `GET /api/subscription/plans`:
   - `stripeCheckoutEnabled` from `stripeConfigured`
   - Android IDs → `com.lardermind.pro.monthly` / `com.lardermind.pro.yearly`
2. Update `GET /api/subscription/status`:
   - `isPro`, `isTrial`, `trialEndsAt`, `expiresAt`, `planName`, `productId` from subscriptions
   - Usage: existing image counters; AI used/limit with daily period (limit values only here if task 09 not done — prefer wire helpers in 09 and call them for limits in status)
3. Keep free/pro tier constants as single source (export from one module if needed).

## Acceptance

- [ ] Without Stripe env → `stripeCheckoutEnabled: false`
- [ ] With entitled D1 row → `isPro: true` (can seed in test)
- [ ] Response shape matches frontend `SubscriptionStatus` / `PlansResponse`

## Notes

Checkout/portal/webhook still missing until 05–07.
