# Task 09: Enforce AI messages per UTC day

**Phase:** 3 — Quotas  
**Depends on:** 03

## Goal

Enforce advertised AI limits: free 20 / Pro 200 per UTC day (S18).

## Work

1. Add `checkAndIncrementAiMessage` in `db/quotas.ts` (or adjacent) with UTC day period reset.
2. Replace increment-only path in chat/agent loop when `chargeQuota !== false`.
3. Status endpoint reports used/limit consistently.
4. On exceed → clear 403 (or existing API error shape used for quotas).

## Acceptance

- [ ] Free 21st message in same UTC day blocked
- [ ] Day rollover resets counter
- [ ] Pro allows up to 200; admin unlimited
- [ ] Unit tests for period helper + limit branches

## Notes

Do not change model/provider selection.
