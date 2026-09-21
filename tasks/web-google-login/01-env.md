# Task 01: Env — FRONTEND_URL + GOOGLE_CLIENT_ID

**Phase:** 1 — Core  
**Depends on:** —  
**Blocks:** 03, 04

## Description

Add `FRONTEND_URL` to Worker `Env`. Set `[vars]` in `wrangler.toml` for production values (Web Client ID + `https://lardermind.com`). Document local override via `.dev.vars` if needed.

## Files

| Action | Path |
|--------|------|
| Edit | `backend-cf/src/env.ts` |
| Edit | `backend-cf/wrangler.toml` |

## Acceptance criteria

- [ ] `Env` includes `FRONTEND_URL: string` and `GOOGLE_CLIENT_ID: string` (or optional with runtime checks on Google routes)
- [ ] `wrangler.toml` `[vars]` has production `FRONTEND_URL` and `GOOGLE_CLIENT_ID`
