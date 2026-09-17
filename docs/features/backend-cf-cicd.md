# Feature: Cloudflare Workers CI/CD (`backend-cf`)

**Status:** Implemented — set GitHub secrets to activate  
**Scope:** GitHub Actions deploy of `backend-cf/` to Cloudflare Workers + remote D1 migrate on push to `main`  
**Out of scope:** Pages frontend deploy, Nest/Railway CI, staging environment, PR preview Workers

---

## 1. Summary

Automate deploy of the parallel Cloudflare API so pushes to `main` that touch `backend-cf/**` apply remote D1 migrations and run `wrangler deploy`, using GitHub secrets for Cloudflare auth.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Trigger | Push to `main` + path filter `backend-cf/**` (and the workflow file) | Avoid unrelated monorepo noise |
| Auth | `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` GitHub secrets | Standard Wrangler CI; no interactive login |
| JWT | Keep as Cloudflare Worker secret (`wrangler secret put`) | Never store `JWT_SECRET` in the workflow |
| Migrations | `wrangler d1 migrations apply lardermind --remote` before deploy | Schema stays in sync with Worker |
| PR checks | Not required for v1 | Deploy-only first; typecheck later if needed |

### What changes

| Area | Before | After |
|------|--------|-------|
| Deploy | Manual `npm run deploy` after login | GitHub Actions on `main` |
| Secrets setup | Local `wrangler login` | Repo secrets + dashboard token |

---

## 2. Non-goals

- Auto-cutover of client `VITE_API_BASE_URL` / mobile env
- Separate staging Worker / D1
- Deploying `frontend/` to Pages in this feature

---

## 3. Success criteria

- [x] Workflow file exists under `.github/workflows/`
- [x] Document which GitHub secrets the operator must set
- [x] On `main` + `backend-cf` changes: migrate remote + deploy
- [x] No secrets committed (`.dev.vars`, `.env`, API tokens)

---

## 4. References

- Design: [backend-cf-cicd-design.md](../design/backend-cf-cicd-design.md)
- Tasks: [tasks/backend-cf-cicd/](../../tasks/backend-cf-cicd/)
- API feature: [backend-cf-api.md](./backend-cf-api.md)
