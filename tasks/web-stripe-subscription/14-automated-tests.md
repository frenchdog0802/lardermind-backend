# Task 14: Automated tests

**Phase:** 6 — Verify  
**Depends on:** 07, 08, 09

## Goal

Regression coverage for entitlement, quotas, webhook security.

## Work

1. Unit: `isEntitled`, price mapping, AI/image period helpers.
2. Route/integration: webhook bad signature; webhook idempotency; status with seeded subscription row.
3. Follow existing `backend-cf` test runner patterns.

## Acceptance

- [ ] Tests pass in CI/local script used by repo
- [ ] Failures are actionable (no flaky Stripe network in unit tests)

## Notes

E2E against real Stripe is manual in task 15.
