# Task 02: D1 migration

**Phase:** 1 — Scaffold  
**Depends on:** 01  
**Blocks:** 04–07

## Description

Add `migrations/0001_init.sql` with users, chat, quota, pantry subset tables.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/migrations/0001_init.sql` |

## Acceptance criteria

- [ ] `wrangler d1 migrations apply lardermind --local` applies cleanly
