# Task 05: Checkout Session

**Phase:** 2 — API  
**Depends on:** 04

## Goal

`POST /api/subscription/checkout` creates hosted Checkout Session (scenarios S1–S3, S13–S15).

## Work

1. Implement auth route per design:
   - Validate `billingPeriod`
   - 503 if not configured
   - 409 + `portalUrl` if already entitled (create portal session)
   - Ensure Customer + D1 mapping
   - Trial 7 days only if never had `stripe_subscription_id`
   - Success/cancel URLs from `FRONTEND_URL`
2. Return `{ checkoutUrl }`.

## Acceptance

- [ ] Invalid period → 400
- [ ] Misconfigured → 503
- [ ] Entitled user → 409 with portal URL (mock Stripe in tests if needed)
- [ ] Metadata / `client_reference_id` include `userId`

## Notes

Do not grant Pro in this handler — webhook only.
