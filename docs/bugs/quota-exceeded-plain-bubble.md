# Bug: Quota-exceeded chat shows a plain grey bubble

**Status:** Resolved  
**Severity:** Major  
**Type:** UX  
**Surface:** GuestChatBox + AICookingAssistant error path on chat `403` / quota

---

## Current behavior

When guest (5/day) or Free (20/day) hits the AI quota, the assistant shows a plain grey/error bubble with the API message. No signup / Pro trial CTA.

## Expected behavior

Quota-hit UI offers clear next step: guests → Sign up free; signed-in Free → Start 7-day Pro trial (navigate to subscription / signup).

## Reproduction

1. Exhaust guest or Free AI messages for the UTC day.
2. Send another chat message.
3. Observe plain error text only.

## Related files

- `frontend/src/components/GuestChatBox.tsx`
- `frontend/src/components/AICookingAssistant.tsx`
- `backend-cf/src/routes/chat.ts` (`turn.kind === 'quota'` → 403)
