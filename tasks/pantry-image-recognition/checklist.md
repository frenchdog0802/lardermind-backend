# Checklist: pantry-image-recognition

## Phase 1 — Backend foundation

- [x] **01** — Env: `OPENAI_API_KEY` + vision model/timeout wiring
- [x] **02** — `PantryItemsService.mergeAddItem` (convert-when-same-kind)
- [x] **03** — OpenAI vision client + prompt/schema parse
- [x] **04** — `PantryVisionModule` recognize + apply endpoints + quota

## Phase 2 — Mobile core

- [x] **05** — `pantryVision` API client + pick/resize helper
- [x] **06** — `PantryImageReviewScreen` edit/confirm/cancel
- [x] **07** — Register hidden Drawer route `PantryImageReview`

## Phase 3 — Entry points

- [x] **08** — Pantry inventory camera/gallery entry
- [x] **09** — Chat attach control → same review flow
- [x] **10** — i18n strings for vision UX

## Phase 4 — Verify

- [x] **11** — Backend (+ mobile) unit tests
- [x] **12** — Acceptance criteria signed off in progress.md
