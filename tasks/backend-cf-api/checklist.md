# Checklist: backend-cf-api

## Phase 1 — Scaffold

- [x] **01** — `backend-cf/` package, wrangler.toml, tsconfig
- [x] **02** — D1 migration `0001_init.sql`
- [x] **03** — Hono app: health, CORS, error envelope
- [x] **04** — Auth: signup/signin/signout + JWT (Nest-compatible)

## Phase 2 — AI chat

- [x] **05** — Chat sessions + history (D1)
- [x] **06** — `POST /api/chat/stream` SSE + Workers AI
- [x] **07** — Subscription plans/status stub

## Phase 3 — Docs & cutover

- [x] **08** — `backend-cf/README.md` deploy + cutover
- [x] **09** — Link from root README + `cloudflare-target.md`

## Phase 4 — Verify

- [x] **10** — Local `wrangler dev --local` smoke (health, auth, plans)
- [x] **11** — Acceptance sign-off in progress.md
