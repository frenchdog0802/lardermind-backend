# Task 02: D1 migration for image upload quota

**Phase:** 1 — Infra  
**Depends on:** None  
**Blocks:** 03

## Description

Add migration `0002_image_uploads.sql` with `image_uploads` and `image_period_start` on `usage_quotas`. Apply locally; ensure signup/quota inserts still work.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/migrations/0002_image_uploads.sql` |

## Acceptance criteria

- [ ] Columns added with safe defaults
- [ ] `npm run db:migrate:local` applies cleanly on top of `0001_init.sql`
- [ ] Existing auth/signup paths still create or use quotas without SQL errors
