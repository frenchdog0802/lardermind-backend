# Feature: Cloudflare Pages web host (`frontend/`)

**Status:** Implemented — set frontend GitHub secrets/vars + Worker CORS to activate  
**Scope:** Host the Vite SPA on **Cloudflare Pages**; build-time API URL points at **`backend-cf` Workers**; CORS allowlist updated for the Pages origin  
**Out of scope:** Custom domain / DNS, PR preview Pages, mobile hosting, R2/Vectorize, rewriting Nest (already removed), Google OAuth production polish

---

## 1. Summary

Ship the web app from Cloudflare Pages so the public stack matches the target map (Pages → Workers → D1). Local Vite remains for day-to-day work; production (and optional staging) is static assets on Pages with `VITE_API_BASE_URL` baked in at build time.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Host | **Cloudflare Pages** project `lardermind-web` | Already named in `frontend/wrangler.toml` |
| Source repo | **`lardermind-frontend`** remote (`frontend/`) | Nested git remote; CI lives there, not backend monorepo |
| Deploy path | **GitHub Actions** + `wrangler pages deploy` | Matches `backend-cf-cicd` pattern; repeatable |
| Build output | `dist/app` | Existing Vite `outDir` + `pages_build_output_dir` |
| SPA routing | `public/_redirects` → `/* /index.html 200` | Already present |
| API for Pages builds | **Workers** URL via `VITE_API_BASE_URL` (GitHub Actions variable/secret) | Nest removed; CF API is the only backend |
| Local API | Vite proxy → `http://127.0.0.1:8787` when `VITE_API_BASE_URL` empty | Align local with `backend-cf` |
| Custom domain | **Not in v1** | Use `*.pages.dev` until branding DNS is ready |
| CORS | Exact Pages origin(s) in `backend-cf` `CORS_ALLOWED_ORIGINS` | Middleware is exact-match (or `*`) |

### What changes

| Area | Before | After |
|------|--------|-------|
| Hosting | Local Vite / aspirational Pages notes | Documented + automated Pages deploy |
| Build env docs | Nest HTTPS URL | Workers `*.workers.dev` (or custom Worker URL) |
| Local proxy | Nest `:8090` | Workers `:8787` |
| CI | No Pages workflow in frontend remote | `.github/workflows/pages.yml` on push to `main` |

---

## 2. Non-goals

- Attaching a custom domain (e.g. `app.lardermind.com`)
- Preview deployments per PR
- Changing SPA product UI / chat-first nav
- Migrating secrets into the backend remote
- Making Pages call Nest again

---

## 3. Success criteria

- [x] Feature + design + tasks exist under this repo’s `docs/` + `tasks/`
- [x] Frontend remote has Pages CI that builds with `VITE_API_BASE_URL` and deploys `dist/app`
- [x] Operator checklist: Cloudflare + GitHub secrets/vars documented
- [x] `backend-cf` CORS docs include adding the Pages origin after first deploy
- [x] Local Vite proxy targets Workers `:8787`
- [x] `cloudflare-target.md` links this feature

---

## 4. Edge cases

| Case | Handling |
|------|----------|
| Missing `VITE_API_BASE_URL` in CI | Fail the job (production must not ship empty API base) |
| Wrong CORS origin | Browser blocks API; operator adds exact `https://….pages.dev` |
| SPA deep link | `_redirects` serves `index.html` with 200 |
| Frontend WIP on `main` | Deploy whatever is on `main`; Pages does not freeze product UI work |

---

## 5. References

- Architecture: [cloudflare-target.md](../architecture/cloudflare-target.md)
- Design: [frontend-cf-pages-design.md](../design/frontend-cf-pages-design.md)
- Tasks: [tasks/frontend-cf-pages/](../../tasks/frontend-cf-pages/)
- Related: [backend-cf-cicd.md](./backend-cf-cicd.md), [backend-cf-api.md](./backend-cf-api.md)
