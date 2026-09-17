# 01 — GitHub Actions deploy workflow

## Goal

Add `.github/workflows/backend-cf.yml` that migrates remote D1 and deploys on push to `main` when `backend-cf/**` (or the workflow) changes.

## Acceptance

- [ ] Triggers on `push` to `main` with path filters
- [ ] Uses `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`
- [ ] Runs migrate then deploy from `backend-cf/`
