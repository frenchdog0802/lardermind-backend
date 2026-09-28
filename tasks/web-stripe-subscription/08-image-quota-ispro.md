# Task 08: Wire isPro into image quotas

**Phase:** 3 — Quotas  
**Depends on:** 03 (04 ideal)

## Goal

Stop hardcoding `isPro: false` on upload paths (S17–S18 images).

## Work

1. `routes/upload.ts` and `routes/pantry-vision.ts`: `resolveEntitlement` → pass `isPro` / admin into `checkAndIncrementImageUpload`.
2. Confirm Pro/admin unlimited; free still 10/UTC month.

## Acceptance

- [ ] Free over quota → 403
- [ ] Entitled user not blocked by image cap
- [ ] Admin unlimited without subscription row

## Notes

No recipe hard caps in this task.
