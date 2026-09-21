# Task 02: GitHub Actions Pages deploy

**Repo:** `frontend/` (lardermind-frontend)

## Goal

On push to `main`/`master`, build the SPA and deploy to Cloudflare Pages project `lardermind-web`.

## Work

1. Add `.github/workflows/pages.yml`.
2. Require `VITE_API_BASE_URL` (fail if missing).
3. Pass optional `VITE_GOOGLE_CLIENT_ID`.
4. Deploy with `npx wrangler pages deploy dist/app --project-name=lardermind-web`.
5. Use `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

## Acceptance

- [ ] Workflow file exists in frontend remote
- [ ] Build uses Actions env for Vite vars
- [ ] Deploy step uses Wrangler Pages
- [ ] No secrets committed
