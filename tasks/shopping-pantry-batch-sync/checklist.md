# Checklist: Shopping list batch sync to pantry

## Docs

- [x] Feature requirements (`docs/features/shopping-pantry-batch-sync.md`)
- [x] Design (`docs/design/shopping-pantry-batch-sync-design.md`)
- [x] Tasks folder scaffold

## Backend (`backend-cf`)

- [x] Check/uncheck does not write pantry
- [x] `POST /api/shopping-list/sync-to-pantry`
- [x] `POST /api/shopping-list/unsync-from-pantry`
- [x] DTO exposes `synced_to_pantry`
- [x] Vitest: decouple + batch + unsync + idempotency
- [x] README / PROJECT_STATUS updated

## Web

- [x] API client + context methods
- [x] Pending sync badge / footer CTA
- [x] Review sheet
- [x] Undo toast
- [x] Uncheck-synced confirm dialog

## Mobile

- [x] Same as web (offline guard on batch sync)
- [x] i18n en + zh

## Acceptance (manual)

- [ ] Check garlic → pantry unchanged
- [ ] Batch sync → pantry shows garlic; flag synced
- [ ] Undo → pantry reverts
- [ ] Toilet paper (no ingredient_id) unchecked by default in sheet
- [ ] Legacy row with flag=1 not double-added
