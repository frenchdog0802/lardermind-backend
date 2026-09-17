# LarderMind API — Cloudflare Workers (`backend-cf/`)

Parallel backend for the CF stack. **Does not replace** Nest until you switch client API URLs.

- Feature: [docs/features/backend-cf-api.md](../docs/features/backend-cf-api.md)
- Design: [docs/design/backend-cf-api-design.md](../docs/design/backend-cf-api-design.md)
- Tasks: [tasks/backend-cf-api/README.md](../tasks/backend-cf-api/README.md)

## Stack

| Piece | Tech |
|-------|------|
| HTTP | Hono on Workers |
| DB | D1 (SQLite) |
| AI chat | Workers AI (streaming SSE) |
| Auth | JWT HS256 (Nest-compatible payload) |

## Local dev

```powershell
cd backend-cf
npm install --legacy-peer-deps
copy .dev.vars.example .dev.vars
# Edit .dev.vars — JWT_SECRET min 32 chars

npm run db:migrate:local
npm run dev
```

Default: `http://127.0.0.1:8787`

`npm run dev` uses `--local` (no Cloudflare login; **Workers AI chat needs** `npm run dev:remote` after `wrangler login`).

Point web (optional):

```env
VITE_API_BASE_URL=http://127.0.0.1:8787
```

Add `http://localhost:5173` to `CORS_ALLOWED_ORIGINS` in `wrangler.toml` if needed.

## First deploy

1. Create D1 and paste id into `wrangler.toml`:

```powershell
npm run db:create
# Copy database_id into wrangler.toml [[d1_databases]]
```

2. Secrets and remote migration:

```powershell
npx wrangler secret put JWT_SECRET
npm run db:migrate:remote
npm run deploy
```

3. Worker URL: `https://lardermind-api.<subdomain>.workers.dev`

## CI/CD (GitHub Actions)

Workflow: [`.github/workflows/backend-cf.yml`](../.github/workflows/backend-cf.yml)

On push to `main`/`master` when `backend-cf/**` changes: remote D1 migrate → `wrangler deploy`.

Set these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|--------|-----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens (Workers + D1 edit) |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → account overview |

`JWT_SECRET` stays a Worker secret (`wrangler secret put JWT_SECRET`) — do not put it in GitHub Actions unless you intentionally rotate it from CI.

## Cutover (when stable)

1. Set `VITE_API_BASE_URL` / `EXPO_PUBLIC_API_BASE_URL` to the Worker URL.
2. Add Pages/mobile origins to `CORS_ALLOWED_ORIGINS` (wrangler var or dashboard).
3. **Note:** CF D1 users are separate from Nest Postgres until a migration task exists.
4. Rollback: point URLs back to Nest.

## v1 routes

| Route | Status |
|-------|--------|
| `GET /api/health` | Done |
| `POST /api/auth/signup`, `signin` | Done |
| `GET /api/auth/signout` | Done |
| `POST /api/chat/stream` | Done (Workers AI, no tools) |
| Chat sessions / history | Done |
| `GET /api/subscription/plans`, `status` | Stub |
| Pantry, recipes, upload, Google OAuth | Not yet |

## Smoke test

```powershell
curl http://127.0.0.1:8787/api/health

curl -X POST http://127.0.0.1:8787/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"test@example.com\",\"password\":\"secret123\"}"
```
