# Task 04: Toast hoist + confirm shopping CTA

**Depends on:** 03  
**Repo:** `frontend/`

## Goal

Calendar notifications always visible; confirm shortages can add to shopping.

## Work

1. Move toast UI out of add-recipe modal.
2. Shared helper to create shopping items from shortages (dedupe unchecked name CI + unit).
3. Shortage toast includes Add to shopping action.

## Acceptance

- [ ] Confirm outside modal shows toast
- [ ] CTA creates shopping rows

## Test

Manual: confirm meal with shortages; modal closed; toast + add.
