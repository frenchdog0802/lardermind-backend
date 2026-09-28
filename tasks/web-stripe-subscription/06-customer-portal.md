# Task 06: Customer Portal

**Phase:** 2 — API  
**Depends on:** 04 (05 optional but portal helper shared)

## Goal

`POST /api/subscription/portal` for manage/cancel/payment method / plan switch (S9–S13).

## Work

1. Auth route: require `stripe_customer_id` else 400 `NO_CUSTOMER`.
2. Create Billing Portal Session with `return_url` `?subscription=portal_return`.
3. Return `{ portalUrl }`.
4. Reuse portal creation from checkout 409 path (shared helper).

## Acceptance

- [ ] No customer → 400
- [ ] Configured + customer → URL returned
- [ ] Return URL host matches `FRONTEND_URL` only

## Notes

Document Dashboard Portal configuration in task 13 (products for both prices, cancel at period end).
