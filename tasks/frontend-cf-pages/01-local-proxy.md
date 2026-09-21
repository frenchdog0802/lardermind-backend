# Task 01: Local Vite proxy → Workers

**Repo:** `frontend/` (lardermind-frontend)

## Goal

Align local web dev with `backend-cf` on port **8787** instead of removed Nest `:8090`.

## Work

1. In `vite.config.js`, change proxy `target` for `/api` and `/auth` to `http://127.0.0.1:8787`.
2. Update `.env.example` comments: empty `VITE_API_BASE_URL` uses proxy to Workers; remote example uses Worker URL / `http://127.0.0.1:8787`.

## Acceptance

- [ ] Proxy targets `:8787`
- [ ] `.env.example` no longer documents Nest `:8090` as the primary path
