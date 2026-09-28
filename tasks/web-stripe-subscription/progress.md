# Progress: Web Stripe subscription

| Date | Update |
|------|--------|
| 2026-09-22 | Feature + design + task breakdown created. Coding not started. |
| 2026-09-23 | Implemented tasks 01–14: D1 migration, Stripe checkout/portal/webhook, entitlement, AI+image quotas, frontend Manage billing, legal + README. Local migration applied. Unit tests passing (72). Task 15 smoke pending operator Stripe Price IDs + secrets. |
| 2026-09-28 | Operator filled local `.dev.vars` Stripe test keys. API smoke via `backend-cf/scripts/stripe-api-smoke.mjs` (no Playwright / no Stripe CLI): 10/10 PASS — plans enabled, Checkout Session URL, signed webhook → `isPro`+trial, already-subscribed → 409 portal. Still open for Task 15: hosted Checkout UI click-path, yearly, cancel URL banner, past_due, live cutover, S20 legal on Pages. |
