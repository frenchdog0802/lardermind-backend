# Task 10: Frontend — Manage billing + portal API

**Phase:** 4 — Frontend  
**Depends on:** 06

## Goal

SPA can open Customer Portal; Upgrade only when not entitled.

## Work

1. `subscriptionApi.createPortal()` → `{ portalUrl }`.
2. `SubscriptionPanel`: show **Manage billing** when `isPro` or customer/portal available; show `UpgradeButtons` when `!isPro`.
3. Show trial end copy when `isTrial` + `trialEndsAt`.
4. Match existing visual language (no new design system).

## Acceptance

- [ ] Pro user sees Manage, not duplicate Subscribe CTAs
- [ ] Free + `stripeCheckoutEnabled` sees monthly/yearly buttons
- [ ] Portal click redirects to returned URL

## Notes

Landing `PricingSection` may stay auth CTA only.
