# Task 04: backend-cf CORS + Pages cutover notes

**Repo:** this remote (lardermind-backend)

## Goal

Operators know how to allow the Pages origin on the Worker after first deploy.

## Work

1. In `backend-cf/README.md`, add a short **Pages CORS** subsection under Cutover (or CI): add `https://lardermind-web.pages.dev` (actual URL) to `CORS_ALLOWED_ORIGINS`.
2. Mention that frontend CI lives in **lardermind-frontend**, not this repo.

## Acceptance

- [ ] README tells operator to add Pages origin
- [ ] Points to frontend remote for Pages deploy
