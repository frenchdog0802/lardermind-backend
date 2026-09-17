# Task 04: PantryVisionModule APIs

**Phase:** 1 — Backend foundation  
**Depends on:** 01, 02, 03  
**Blocks:** 05

## Description

`POST /api/pantry-vision/recognize` (multipart + quota) and `POST /api/pantry-vision/apply` (merge-add). Register module in `AppModule`.

## Files

| Action | Path |
|--------|------|
| Create | `backend-node/src/pantry-vision/*` |
| Modify | `backend-node/src/app.module.ts` |
| Modify | `backend-node/src/pantry-items/pantry-items.module.ts` (export service if needed) |

## Acceptance criteria

- [ ] Recognize validates image, increments `image_uploads`, calls vision
- [ ] Apply validates 1–25 items and merge-adds
- [ ] JWT required; no Cloudinary on recognize path
