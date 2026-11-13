# Bug: Guest demo controls disabled after load with no feedback

**Status:** Resolved  
**Severity:** Major  
**Type:** UX  
**Surface:** `GuestChatBox` while minting guest JWT

---

## Current behavior

Input / Send / quick prompts use `busy = isTyping || minting || !guestToken`. For a moment after load, clicks do nothing with no loading affordance.

## Expected behavior

Show “Starting demo…” (or spinner) while minting; controls stay disabled but the wait is visible.

## Related files

- `frontend/src/components/GuestChatBox.tsx`
