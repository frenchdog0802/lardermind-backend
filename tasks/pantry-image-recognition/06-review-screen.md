# Task 06: PantryImageReviewScreen

**Phase:** 2 — Mobile core  
**Depends on:** 05  
**Blocks:** 07, 08, 09

## Description

Shared review UI: list draft items, edit name/qty/unit/category, remove row, Confirm → apply, Cancel → goBack.

## Files

| Action | Path |
|--------|------|
| Create | `mobile/src/screens/PantryImageReviewScreen.tsx` |

## Acceptance criteria

- [ ] Confirm disabled when no valid rows
- [ ] Cancel does not call apply
- [ ] Success refreshes pantry and navigates back
- [ ] Apply failure keeps draft for retry
