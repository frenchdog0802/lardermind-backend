# Task 05: Public media GET

**Phase:** 2 — API  
**Depends on:** 01, 04  
**Blocks:** 07–08

## Description

Add `GET /api/media/:userId/:objectName` that streams from R2 with Content-Type + long-cache headers. Validate path shape; 404 on miss or invalid name.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/routes/media.ts` |
| Edit | `backend-cf/src/index.ts` |
| Edit | `backend-cf/src/lib/media.ts` (shared validators if needed) |

## Acceptance criteria

- [ ] Upload `imageUrl` fetches successfully without JWT
- [ ] Invalid / missing keys → 404
- [ ] `Cache-Control` set per design
