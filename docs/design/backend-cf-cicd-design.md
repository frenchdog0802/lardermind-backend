# Design: Cloudflare Workers CI/CD

**Feature:** [backend-cf-cicd.md](../features/backend-cf-cicd.md)

## Architecture

```
GitHub (push main/master, paths: backend-cf/**)
  → job: Install dependencies   (npm ci)
  → job: Apply D1 migrations    (needs install)
  → job: Deploy Worker          (needs migrate)
  → Cloudflare Workers + D1 (existing lardermind binding)
```

Jobs are separate so the Actions graph shows three nodes; `needs` keeps order (migrate failure blocks deploy).

Auth: Wrangler reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from workflow `env` (mapped from GitHub secrets).

`JWT_SECRET` remains a Worker secret already set via CLI/dashboard; the workflow does not set or rotate it.

## Workflow shape

- File: `.github/workflows/backend-cf.yml`
- Runner: `ubuntu-latest` (each job)
- Node: 22 (match mobile CI)
- Working directory: `backend-cf`
- Install: `npm ci --legacy-peer-deps` (matches local README; each job reinstalls, npm cache shared)
- Job graph: `install` → `migrate` → `deploy`


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
| Migration failure | Deploy job skipped (`needs: migrate`) |
| Token leaked in logs | Do not `echo` secrets; Wrangler uses env only |
| Concurrent pushes | Accept last-writer-wins for v1 |

## Out of scope here

- Branch protections / required checks
- Preview Workers per PR
