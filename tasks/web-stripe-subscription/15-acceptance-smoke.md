# Task 15: Acceptance — scenario smoke

**Phase:** 6 — Verify  
**Depends on:** 10–14, 12 for go-live

## Goal

Manually verify feature scenarios S1–S20 as applicable; mark feature acceptance complete.

## Work

1. With Stripe test mode + CLI webhook, walk:
   - S1/S2 Checkout + Pro
   - S3 cancel URL
   - S4 success-before-webhook messaging
   - S7 past_due (test clock / fail payment if feasible)
   - S9 cancel at period end
   - S13 already subscribed → portal
   - S14 re-subscribe no second trial
   - S15 misconfig flag
   - S17–S18 quotas
   - S20 legal pages live on Pages
2. Update `docs/features/web-stripe-subscription.md` status → Implemented (test) / Live when ready.
3. Update `checklist.md` + `progress.md`.

## Acceptance

- [ ] Feature acceptance boxes in requirements checked or explicitly deferred with reason
- [ ] progress.md notes smoke results + open gaps

## Notes

Live mode cutover is an ops decision after legal skim + test smoke.
