# RCA: Quota-exceeded plain bubble

**Bug:** `docs/bugs/quota-exceeded-plain-bubble.md`  
**Status:** Confirmed via code inspection

## Root cause

Chat routes return `fail(message)` on quota with HTTP 403. Frontend stream/send `onError` paths append a generic `type: 'error'` message bubble. No branch detects quota / rate-limit codes to render an upsell CTA.

## Affected components

GuestChatBox, AICookingAssistant error handlers; chat API error payloads.
