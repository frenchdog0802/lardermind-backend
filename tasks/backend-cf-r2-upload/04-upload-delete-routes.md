# Task 04: Upload and delete routes

**Phase:** 2 — API  
**Depends on:** 01, 03  
**Blocks:** 05, 07

## Description

Add JWT-protected `POST /api/upload/image` (multipart field `file`) and `DELETE /api/upload/image/:publicId` per design. Mount on Hono app. Validate MIME/size; put/delete R2 objects under `{userId}/{uuid}.{ext}`.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/lib/media.ts` |
| Create | `backend-cf/src/routes/upload.ts` |
| Edit | `backend-cf/src/index.ts` |

## Acceptance criteria

- [ ] Upload returns `{ imageUrl, publicId }` envelope
- [ ] Rejects bad MIME / >8MB / missing file
- [ ] Delete only when key prefixed by caller `userId`
- [ ] Missing object on delete → 404
