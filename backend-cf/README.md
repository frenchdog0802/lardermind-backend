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
| AI chat | DeepSeek via Cloudflare AI Gateway (SSE) |
| Vision | OpenAI gpt-4o via AI Gateway (`/api/pantry-vision/*`) |
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

`npm run dev` uses `--local` (no Cloudflare login required for D1/R2 simulation). Chat and vision call **AI Gateway over the public internet**, so they work with local `wrangler dev` once `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` are set in `.dev.vars`.

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
npx wrangler secret put DEEPSEEK_API_KEY
npx wrangler secret put OPENAI_API_KEY
npm run db:migrate:remote
npm run deploy
```

Confirm `CF_ACCOUNT_ID` / `AI_GATEWAY_ID` in `wrangler.toml` match the Cloudflare account and AI Gateway (default gateway id is usually `default`).

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
| `POST /api/auth/google-login` | Done (JSON `{ token }` = Google ID token) |
| `POST /api/auth/google-callback` | Done (form `credential` → 302 `#google_auth=`) |
| `POST /api/chat/stream` | Done (DeepSeek via AI Gateway, no tools) |
| Chat sessions / history | Done |
| `GET /api/subscription/plans`, `status` | Stub |
| `POST /api/upload/image` | Done (JWT, multipart field `file`, max 8 MB) |
| `DELETE /api/upload/image/:publicId` | Done (JWT; `publicId` = `{userId}/{uuid}.ext`) |
| `GET /api/media/:userId/:objectName` | Done (public; streams from R2) |
| `GET/POST/PUT/DELETE /api/pantry-item` (+ `/bulk`) | Done (JWT; D1 `pantry_items`) |
| `POST /api/pantry-vision/recognize` | Done (OpenAI via AI Gateway; multipart `image`) |
| `POST /api/pantry-vision/apply` | Done (JWT; merge-add pantry) |
| `GET/PUT /api/user-preferences` | Done |
| `GET/POST/PUT/DELETE /api/shopping-list` | Done |
| `GET/POST/PUT/DELETE /api/folder` | Done |
| `GET/POST/PUT/DELETE /api/ingredient` | Done |
| `GET/POST/PUT/DELETE /api/recipe` | Done |
| `GET/POST/PUT/DELETE /api/meal-plan` (+ confirm/skip/pending-confirm) | Done |
| `DELETE /api/chat/history`, `GET /api/chat/actions` | Done (actions stub empty) |
| Upload field `image` alias + dual response keys | Done |
| Stripe checkout / IAP validate-sync / chat HITL resume | Not yet (deferred) |

### Google login notes

- Web GIS redirect posts to `{API}/api/auth/google-callback`; Worker verifies ID token (`aud` = `GOOGLE_CLIENT_ID`) then redirects to `FRONTEND_URL/#google_auth=<base64url>`.
- Worker vars (see `wrangler.toml`): `GOOGLE_CLIENT_ID`, `FRONTEND_URL` (no trailing slash; prod `https://lardermind.com`).
- Frontend: set `VITE_GOOGLE_CLIENT_ID` to the **same** Web Client ID; prod `VITE_API_BASE_URL=https://api.lardermind.com`.
- Google Console redirect URI: `https://api.lardermind.com/api/auth/google-callback` (plus local `http://127.0.0.1:8787/api/auth/google-callback`).
- Local redirect testing: put `FRONTEND_URL=http://localhost:5173` in `backend-cf/.dev.vars` so callback returns to Vite.

### Image upload notes

- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`
- Free quota: **10 uploads / UTC calendar month** (`usage_quotas.image_uploads`); admin role unlimited
- Success envelope: `{ success, message, data: { imageUrl, publicId, image_url, public_id } }`
- Multipart field: `file` or `image`
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
