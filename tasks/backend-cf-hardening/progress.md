# Progress

- Started: 2026-10-22
- Classified: new API hardening feature + HITL double-execution bug
- Decisions: PBKDF2-SHA256 @ 100,000 iterations; keep long-lived JWT (refresh-token plan documented); HITL TTL 20 minutes; idempotency retention 24 hours; no shopping batch endpoint; no ESLint because none is configured
- Completed: 2026-10-22
  - Migration `0011_backend_hardening.sql`
  - Password rehash, auth rate limits, zod + OpenAPI, request logs, shopping version/idempotency, HITL claim + checkpoint
  - Vitest coverage for rehash, rate limit, double approve, expiry, idempotent create, version conflict
