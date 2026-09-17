# Feature: Cloudflare Backend API (`backend-cf/`)

**Status:** v1 scaffold complete — deploy + URL cutover when ready  
**Scope:** New parallel API on Cloudflare Workers + D1 + Workers AI — **does not replace** Nest until URL cutover  
**Out of scope:** Deleting `backend-node/`, Postgres data migration, R2 uploads, Vectorize RAG, Browser Rendering, Turnstile, full CRUD parity with Nest

---

## 1. Summary

Add a **greenfield** Cloudflare backend (`backend-cf/`) so LarderMind can run API + AI on the CF stack without rewriting Nest in place. Web/mobile keep the same HTTP contract where possible; production switches by changing `VITE_API_BASE_URL` / `EXPO_PUBLIC_API_BASE_URL` when stable.

**Why now:** Nest agent on Render free/small tiers hits **memory limits**; CF Workers + Workers AI offloads inference from a fat Node process.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Strategy | **Parallel project** (`backend-cf/`), not in-place Nest rewrite | Cutover = URL swap; Nest stays for Android path until ready |
| Runtime | **Workers + Hono** | Lightweight edge HTTP; fits agent orchestration |
| Database | **D1** (SQLite) | CF-native; fresh users on CF until migration |
| AI (v1) | **Workers AI** streaming | No LangGraph on Worker; avoid Render RAM |
| Auth JWT | **Same shape** as Nest (`user_id`, HS256) | Optional shared `JWT_SECRET` during dual-run tests |
| API envelope | `{ success, message, data? }` | Match existing web/mobile clients |
| Nest | **Unchanged** | No edits required for this feature to start |

### What changes

| Area | Before | After |
|------|--------|-------|
| Backend deploy target | Nest on Render/Railway only | **Also** Workers at `*.workers.dev` |
| AI chat execution | LangGraph in Nest (heavy RAM) | Workers AI + light SSE orchestration in Worker |
| User data (CF path) | Postgres only | D1 for CF signups (separate from Nest users until migration) |
| Docs | `cloudflare-target.md` aspirational | Actionable feature + tasks under `tasks/backend-cf-api/` |

### v1 route parity (target)

| Priority | Routes | v1 |
|----------|--------|-----|
| P0 | `GET /api/health` | Yes |
| P0 | `POST /api/auth/signup`, `signin`, `signout` | Yes |
| P0 | `POST /api/chat/stream`, sessions, history | Yes (Workers AI; no tools yet) |
| P1 | `GET /api/subscription/plans`, `status` | Stub / minimal |
| P2 | pantry, recipes, meal-plan, upload, … | Later tasks |

---

## 2. Cutover model

```
Phase A (now):  Web/Pages ──► Nest (Render)     mobile ──► Nest
Phase B:        Web/Pages ──► backend-cf (CF)   (optional dual-test)
Phase C:        All clients ──► backend-cf       Nest retired
```

**URL switch only** — no monorepo merge required. D1 users ≠ Postgres users until a migration task exists.

---

## 3. Non-goals (this feature)

- LangGraph / PostgresSaver port to Workers
- Stripe / Play Billing receipt validation on CF
- Cloudinary → R2 migration
- Automatic data sync Nest ↔ D1

---

## 4. Success criteria

- [x] `wrangler dev` serves `GET /api/health` → `{ status: 'UP' }`
- [x] Signup/signin returns Nest-compatible `{ token, user }` envelope
- [x] `POST /api/chat/stream` streams SSE `token` + `done` (Workers AI; needs `wrangler login` to test E2E)
- [x] README documents deploy + env + cutover steps
- [x] Nest codebase untouched

---

## 5. References

- Target map: [cloudflare-target.md](../architecture/cloudflare-target.md)
- Design: [backend-cf-api-design.md](../design/backend-cf-api-design.md)
- Tasks: [tasks/backend-cf-api/README.md](../../tasks/backend-cf-api/README.md)
