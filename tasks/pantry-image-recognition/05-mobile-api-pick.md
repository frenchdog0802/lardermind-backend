# Task 05: Mobile pantryVision client + pick helper

**Phase:** 2 — Mobile core  
**Depends on:** 04  
**Blocks:** 06, 08, 09

## Description

API client for recognize/apply; shared camera/library pick with resize (max 1280).

## Files

| Action | Path |
|--------|------|
| Create | `mobile/src/api/pantryVision.ts` |
| Create | `mobile/src/utils/pantryImagePick.ts` |

## Acceptance criteria

- [ ] `recognize(uri)` posts multipart with JWT
- [ ] `apply(items)` posts JSON
- [ ] Pick helper returns local URI or null on cancel; handles permission denial
