# Design: Cloudflare Pages web host

**Feature:** [frontend-cf-pages.md](../features/frontend-cf-pages.md)

## Architecture

```
GitHub lardermind-frontend (push main)
  → Actions
      → npm ci
      → npm run build   (env: VITE_API_BASE_URL, optional VITE_GOOGLE_CLIENT_ID)
      → wrangler pages deploy dist/app --project-name=lardermind-web
  → Cloudflare Pages (static SPA)
        │
        │  browser fetch(`${VITE_API_BASE_URL}/api/...`)
        ▼
  Cloudflare Worker lardermind-api  (CORS allowlist includes Pages origin)
```

Local:

```
Vite :5173  --proxy /api,/auth-->  Worker local :8787
```

## Existing assets (reuse)

| File | Role |
|------|------|
| `frontend/wrangler.toml` | `name = lardermind-web`, `pages_build_output_dir = dist/app` |
| `frontend/public/_redirects` | SPA fallback |
| `frontend/vite.config.js` | `outDir: dist/app`; update proxy target to `:8787` |

## Workflow shape

- Path: `frontend/.github/workflows/pages.yml` (frontend git remote)
- Trigger: push to `main` / `master`
- Node: 22
- Steps: checkout → setup-node (cache lockfile) → `npm ci` → `npm run build` → `npx wrangler pages deploy dist/app --project-name=lardermind-web`
- Env for build:
  - `VITE_API_BASE_URL` — required (GitHub Actions **variable** or secret)
  - `VITE_GOOGLE_CLIENT_ID` — optional
- Env for deploy:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`

Token needs **Pages** edit (and Account read as usual). Prefer a dedicated token or extend the existing Workers token with Pages permissions.

## Operator setup (manual, once)

1. Cloudflare dashboard: ensure Pages project `lardermind-web` exists (first `wrangler pages deploy` can create it), or create empty project.
2. GitHub **lardermind-frontend** → Secrets:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
3. GitHub **lardermind-frontend** → Variables (or secrets):
   - `VITE_API_BASE_URL` = `https://lardermind-api.<subdomain>.workers.dev` (no trailing slash)
   - optional `VITE_GOOGLE_CLIENT_ID`
4. After first Pages URL is known, set Worker var `CORS_ALLOWED_ORIGINS` to include:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `https://lardermind-web.pages.dev` (and any preview hostname if used later)
5. Smoke: open Pages URL → signup/health against Worker.

## CORS note

`backend-cf` cors middleware allows exact origins (or `*`). Document in `backend-cf/README.md`; do not commit a guessed production Pages URL. Operator pastes the real origin after first deploy.

Optional code touch in this feature: none required if README + wrangler `[vars]` comment is enough. If a placeholder comment already lists Nest, replace with Workers + Pages guidance.

## Local proxy

Update `vite.config.js` proxy targets from `http://localhost:8090` → `http://127.0.0.1:8787`.  
Update `.env.example` and `frontend/README.md` accordingly.

## Edge cases / security

| Case | Handling |
|------|----------|
| Empty `VITE_API_BASE_URL` in CI | Explicit step fails if unset |
| Token scopes | Pages deploy fails clearly; document required permissions |
| Secret in logs | Do not echo env values |
| Concurrent deploys | Last writer wins (same as Workers CI) |

## Out of scope here

- Custom domains / Cloudflare DNS records
- Branch preview URLs + CORS for every preview
- Changing product UI
