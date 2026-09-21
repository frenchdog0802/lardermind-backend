# Task 01: Enable R2 binding

**Phase:** 1 — Infra  
**Depends on:** None  
**Blocks:** 04–05

## Description

Uncomment / add R2 bucket binding in `wrangler.toml` for `lardermind-media` as `R2`. Make `Env.R2` required. Document create command in task notes (README update is task 06).

## Files

| Action | Path |
|--------|------|
| Edit | `backend-cf/wrangler.toml` |
| Edit | `backend-cf/src/env.ts` |

## Acceptance criteria

- [ ] `[[r2_buckets]]` binding `R2`, bucket_name `lardermind-media`
- [ ] `Env.R2` is `R2Bucket` (not optional)
- [ ] `wrangler dev` still starts (local R2 sim)
