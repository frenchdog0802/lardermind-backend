# LarderMind `backend-node`

NestJS + TypeScript API — **full Spring parity** (default port **8090**).

Same `ApiResponse` / DTO wire shapes so web and mobile switch via env only.

> Port **8081** is commonly used by Expo Metro; Nest defaults to **8090**.

> **Note:** The Spring Boot `backend/` tree has been removed from this monorepo. Nest is the only API.

Migration tracker: [`tasks/backend-node-migration/`](../tasks/backend-node-migration/)  
Wave 2 feature doc: [`docs/features/backend-node-wave2-complete.md`](../docs/features/backend-node-wave2-complete.md)

## Quick start

```powershell
cd backend-node
copy .env.example .env   # fill secrets; JWT_SECRET must be ≥ 32 chars
npm install
npm run prisma:generate
npm run dev
```

API base: `http://localhost:8090`

### Point clients at Node

| Client | Env |
|--------|-----|
| Web | `VITE_API_BASE_URL=http://localhost:8090` |
| Mobile | `EXPO_PUBLIC_API_BASE_URL=http://localhost:8090/api/` |

## Endpoints (full parity)

| Area | Paths |
|------|--------|
| Health | `GET /api/health` (bare `{ status, timestamp }`) |
| Auth | `/api/auth/signup`, `signin`, `signout`, `google-login`, `google-callback` |
| Users | `/api/users` |
| Preferences | `/api/user-preferences` |
| Folders | `/api/folder` |
| Ingredients | `/api/ingredient` (+ `/bulk`) |
| Recipes | `/api/recipe` |
| Pantry | `/api/pantry-item` (+ `/bulk`) |
| Shopping | `/api/shopping-list` (+ `/bulk`) |
| Meal plans | `/api/meal-plan` CRUD + `pending-confirm`, `/{id}/confirm`, `/{id}/skip` |
| Chat | `/api/chat/send`, `/stream`, `/history`, `/actions` |
| Upload | `/api/upload/image` |
| Subscription | `/api/subscription/plans`, `status`, `sync`, `validate-receipt`, `checkout`, `webhook` |

## Deploy (Render / Railway)

- Root Directory: **`backend-node/`**
- Uses `Dockerfile` + `railway.toml`
- Health check: `/api/health`
- Reuse Spring env vars; remove `JAVA_OPTS` / `SPRING_*`
- Optional Wave 2: `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` (pantry vision), `CLOUDINARY_*`, `STRIPE_*`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`

## Env inheritance

Same names as Spring `backend/.env.example` (`DB_*`, `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `FRONTEND_URL`, `CORS_ALLOWED_ORIGINS`, …). See `.env.example`.

Compatibility notes:

- Passwords: **HMAC-SHA1** + per-user `salt` (hex) — Spring-compatible
- JWT: **HS256**, claim `user_id`, `iat`, **no `exp`**
- Prisma: **client / introspect only** — do not `migrate`/`db push` on the shared DB while Hibernate `ddl-auto: update` owns schema

`DATABASE_URL` is built from `DB_*` at runtime (and via `scripts/with-database-url.ts` for Prisma CLI).

## Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` | Watch mode |
| `npm run build` | Compile |
| `npm start` / `start:prod` | Run |
| `npm run lint` | ESLint |
| `npm test` | Unit tests |
| `npm run test:e2e` | Smoke e2e (CRUD needs Postgres) |
| `npm run prisma:generate` | Generate client |
| `npm run prisma:pull` | Introspect DB → schema (optional) |

## Quality gates

```powershell
npm run lint
npm run build
npm test
npm run test:e2e
```
