# Task 12: Legal — Terms + Privacy for Stripe

**Phase:** 5 — Legal & docs  
**Depends on:** none (required before go-live)

## Goal

Disclose paid web subscriptions and Stripe as processor (S20).

## Work

1. Update `docs/legal/terms-of-service.html` (ZH + EN): auto-renew, pricing reference, cancel via Portal / support, web vs app store billing distinction.
2. Update `docs/legal/privacy-policy.html`: Stripe processes payments; we store customer/subscription ids; no full card numbers.
3. Sync copies under `frontend/public/legal/` if that is the deploy path.
4. Update `docs/legal/README.md`: Subscriptions/IAP — web Stripe disclosed; App IAP still pending if true.

## Acceptance

- [ ] Both languages updated
- [ ] README status line updated
- [ ] No fabricated company claims beyond existing Bert / support@lardermind.com / Canada

## Notes

User should skim legal before production live mode.
