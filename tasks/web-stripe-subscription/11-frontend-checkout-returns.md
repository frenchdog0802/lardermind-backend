# Task 11: Frontend — checkout errors + return queries

**Phase:** 4 — Frontend  
**Depends on:** 05, 10

## Goal

Handle already-subscribed / not-configured; portal return query (S3, S4, S13, S15).

## Work

1. `UpgradeButtons`: on 409 with `portalUrl`, redirect there; on 503 show clear message.
2. `App.tsx`: handle `?subscription=portal_return` (open Subscription view); keep success/cancelled.
3. After success banner, refresh status (already loads on mount; optional short retry if `!isPro`).

## Acceptance

- [ ] Success/cancelled/portal_return strip query after handling
- [ ] 409 path does not show generic error only
- [ ] Misconfigured messaging remains friendly

## Notes

Do not grant Pro client-side from query params.
