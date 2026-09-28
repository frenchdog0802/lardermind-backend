# Tasks: Web Stripe subscription

**Feature:** [docs/features/web-stripe-subscription.md](../../docs/features/web-stripe-subscription.md)  
**Design:** [docs/design/web-stripe-subscription-design.md](../../docs/design/web-stripe-subscription-design.md)

Track status in [progress.md](./progress.md) and [checklist.md](./checklist.md).

## Phases

| Phase | Tasks | Focus |
|-------|-------|--------|
| 1 — Data & config | 01–03 | Migration, env, Stripe client + entitlement helpers |
| 2 — API | 04–07 | Status/plans, checkout, portal, webhook |
| 3 — Quotas | 08–09 | Wire `isPro` images; enforce AI daily limits |
| 4 — Frontend | 10–11 | Portal + checkout error UX; return query |
| 5 — Legal & docs | 12–13 | Terms/Privacy; backend-cf README + ops |
| 6 — Verify | 14–15 | Automated tests; acceptance / scenario smoke |

**Coding rule:** One task at a time; update checklist + progress after each.  
**Do not start coding until operator can supply test Price IDs + secret key (or implement behind env and document placeholders).**
