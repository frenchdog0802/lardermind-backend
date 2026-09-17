# Design: Cloudflare Workers CI/CD

**Feature:** [backend-cf-cicd.md](../features/backend-cf-cicd.md)

## Architecture

```
GitHub (push main, paths: backend-cf/**)
  → Actions job
      → npm ci (backend-cf)
      → wrangler d1 migrations apply --remote
      → wrangler deploy
  → Cloudflare Workers + D1 (existing lardermind binding)
```

Auth: Wrangler reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from the job env (mapped from GitHub secrets).

`JWT_SECRET` remains a Worker secret already set via CLI/dashboard; the workflow does not set or rotate it.

## Workflow shape

- File: `.github/workflows/backend-cf.yml`
- Runner: `ubuntu-latest`
- Node: 22 (match mobile CI)
- Working directory: `backend-cf`
- Install: `npm ci --legacy-peer-deps` (matches local README)
- Steps order: checkout → setup-node (cache lockfile) → install → migrate remote → deploy

## Operator setup (manual, once)

1. Cloudflare → API Tokens → create token with Workers + D1 edit
2. GitHub repo → Settings → Secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. Ensure `wrangler.toml` has real `database_id` (already set for `lardermind`)

## Edge cases / security

| Case | Handling |
|------|----------|
| Secrets missing | Job fails at wrangler; no partial silent success |
| Migration failure | Deploy step must not run (sequential steps) |
| Token leaked in logs | Do not `echo` secrets; Wrangler uses env only |
| Concurrent pushes | Accept last-writer-wins for v1 |

## Out of scope here

- Branch protections / required checks
- Preview Workers per PR
