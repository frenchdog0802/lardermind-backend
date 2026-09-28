# Task 01: D1 migration — subscriptions

**Phase:** 1 — Data & config  
**Depends on:** none

## Goal

Add D1 schema for Stripe customer/subscription entitlement and webhook idempotency.

## Work

1. Create `backend-cf/migrations/0006_subscriptions.sql` per design:
   - `subscriptions` (incl. `source DEFAULT 'stripe'`)
   - `stripe_webhook_events`
   - Unique indexes on customer / subscription ids
2. Apply locally (`wrangler d1 migrations apply` / project’s usual path).

## Acceptance

- [ ] Migration file exists and applies cleanly on empty + existing D1
- [ ] No changes to unrelated tables beyond FKs to `users`

## Notes

Do not implement routes in this task.
