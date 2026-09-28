# Task 07: Webhook handler

**Phase:** 2 — API  
**Depends on:** 03, 05 (subscription upsert used by checkout completion)

## Goal

Verified, idempotent webhook covering lifecycle + invoice events (S4–S12, S16, S19).

## Work

1. `POST /api/subscription/webhook` with **raw body** verification.
2. Idempotency via `stripe_webhook_events`.
3. Handle events listed in design; upsert via shared mapper.
4. Resolve `userId` safely; unknown user → log + 200.
5. Ensure route registration does not break JSON parsers for other routes.

## Acceptance

- [ ] Bad signature → 400, no DB write
- [ ] Duplicate `event.id` → 200, no double upsert side effects
- [ ] `customer.subscription.updated` to `past_due` → still entitled
- [ ] `deleted` / `canceled` / `unpaid` → not entitled
- [ ] Tests cover signature failure + idempotency (+ status mapping)

## Notes

Use Stripe test fixtures or signed payload helpers in tests.
