# LarderMind API — Cloudflare Workers (`backend-cf/`)

Parallel backend for the CF stack. **Does not replace** Nest until you switch client API URLs.

- Feature: [docs/features/backend-cf-api.md](../docs/features/backend-cf-api.md)
- Design: [docs/design/backend-cf-api-design.md](../docs/design/backend-cf-api-design.md)
- Tasks: [tasks/backend-cf-api/README.md](../tasks/backend-cf-api/README.md)
- R2 upload: [docs/features/backend-cf-r2-upload.md](../docs/features/backend-cf-r2-upload.md)

## Stack

| Piece | Tech |
|-------|------|
| HTTP | Hono on Workers |
| DB | D1 (SQLite) |
| Media | R2 (`lardermind-media`) |
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

`npm run dev` uses `--local` (no Cloudflare login; **Workers AI chat needs** `npm run dev:remote` after `wrangler login`). Local R2 is simulated automatically — no separate bucket create for `wrangler dev --local`.

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

2. Create the R2 bucket (once per account):

```powershell
npx wrangler r2 bucket create lardermind-media
```

Binding is already in `wrangler.toml` (`binding = "R2"`, `bucket_name = "lardermind-media"`).

3. Secrets and remote migration:

```powershell
npx wrangler secret put JWT_SECRET
npm run db:migrate:remote
npm run deploy
```

4. Worker URL: `https://lardermind-api.<subdomain>.workers.dev`

## CI/CD (GitHub Actions)

Workflow: [`.github/workflows/backend-cf.yml`](../.github/workflows/backend-cf.yml)

On push to `main`/`master` when `backend-cf/**` changes, three jobs run in order:
**Install dependencies** → **Apply D1 migrations** → **Deploy Worker**.

Set these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Where to get it |
|--------|-----------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard → account overview |

**API token permissions** (Workers deploy + D1 + R2):

| Permission | Access |
|------------|--------|
| Account → Workers Scripts | Edit |
| Account → D1 | Edit |
| Account → Workers R2 Storage | Edit |

`JWT_SECRET` stays a Worker secret (`wrangler secret put JWT_SECRET`) — do not put it in GitHub Actions unless you intentionally rotate it from CI.

## Pages CORS

Web hosting CI lives in the **lardermind-frontend** remote (`frontend/.github/workflows/pages.yml`), not this repo. After the first Pages deploy:

1. Note the origin (production: `https://lardermind.com`; also `https://lardermind-web.pages.dev`).
2. Add it to `CORS_ALLOWED_ORIGINS` (comma-separated) in `wrangler.toml` `[vars]`, dashboard, or Worker vars — keep local Vite origins too:
   - `http://localhost:5173`
   - `http://127.0.0.1:5173`
   - `https://lardermind.com`
   - `https://lardermind-web.pages.dev`
3. Redeploy this Worker (or update the var in the dashboard) so browsers can call the API.

Feature: [docs/features/frontend-cf-pages.md](../docs/features/frontend-cf-pages.md).

## Cutover (when stable)

1. Set frontend CI `VITE_API_BASE_URL` / mobile `EXPO_PUBLIC_API_BASE_URL` to the Worker URL.
2. Add Pages/mobile origins to `CORS_ALLOWED_ORIGINS` (see **Pages CORS** above).
3. Rollback web: point Pages build env at a previous API URL, or redeploy an older frontend.

## v1 routes

| Route | Status |
|-------|--------|
| `GET /api/health` | Done |
| `POST /api/auth/signup`, `signin` | Done |
| `GET /api/auth/signout` | Done |
| `POST /api/chat/stream` | Done (Workers AI, no tools) |
| Chat sessions / history | Done |
| `GET /api/subscription/plans`, `status` | Stub |
| `POST /api/upload/image` | Done (JWT, multipart field `file`, max 8 MB) |
| `DELETE /api/upload/image/:publicId` | Done (JWT; `publicId` = `{userId}/{uuid}.ext`) |
| `GET /api/media/:userId/:objectName` | Done (public; streams from R2) |
| Pantry, recipes, Google OAuth | Not yet |

### Image upload notes

- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Free quota: **10 uploads / UTC calendar month** (`usage_quotas.image_uploads`); admin role unlimited
- Success envelope: `{ success, message, data: { imageUrl, publicId } }`
- `imageUrl` is `{origin}/api/media/{userId}/{uuid}.ext` (same API host)

## Smoke test

```powershell
curl http://127.0.0.1:8787/api/health

curl -X POST http://127.0.0.1:8787/api/auth/signup ^
  -H "Content-Type: application/json" ^
  -d "{\"first_name\":\"Test\",\"last_name\":\"User\",\"email\":\"test@example.com\",\"password\":\"secret123\"}"
```

Upload (after signup; replace `TOKEN`):

```powershell
curl -X POST http://127.0.0.1:8787/api/upload/image ^
  -H "Authorization: Bearer TOKEN" ^
  -F "file=@photo.jpg"
```
