# Checklist: backend-cf-r2-upload

## Phase 1 — Infra

- [x] **01** — Enable R2 binding (`lardermind-media`)
- [x] **02** — D1 migration `image_uploads` + period

## Phase 2 — API

- [x] **03** — Quota helper `checkAndIncrementImageUpload`
- [x] **04** — `POST` / `DELETE` `/api/upload/image`
- [x] **05** — `GET` `/api/media/:userId/:objectName`

## Phase 3 — Docs & verify

- [x] **06** — README + CI/token notes
- [x] **07** — Tests (upload / quota / delete / media)
- [x] **08** — Acceptance sign-off
