# Task 13: Docs — backend-cf README + Stripe ops checklist

**Phase:** 5 — Legal & docs  
**Depends on:** 02, 07

## Goal

Operators can configure Stripe Dashboard, secrets, and local CLI.

## Work

1. Update `backend-cf/README.md`: remove “Stripe deferred”; document env, webhook URL, CLI listen, Portal setup, test cards.
2. Ops checklist in README or `docs/` note:
   - Products/prices
   - Webhook events list
   - Customer Portal products (both prices)
   - Test → live cutover
3. Optionally tick/update `docs/store-launch-todo.md` Web Stripe line when feature ships.

## Acceptance

- [ ] New engineer can follow README to run test Checkout locally
- [ ] Webhook event list matches implementation

## Notes

Do not put live secrets in docs.
