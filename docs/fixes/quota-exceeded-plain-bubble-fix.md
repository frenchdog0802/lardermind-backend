# Fix: Quota-exceeded plain bubble

**Bug:** `docs/bugs/quota-exceeded-plain-bubble.md`  
**RCA:** `docs/rca/quota-exceeded-plain-bubble-rca.md`

## Fix approach

1. Detect quota / guest rate-limit errors (message match and/or `code` if present): `AI message quota exceeded`, `guest_chat_rate_limited`, etc.
2. GuestChatBox: render upsell bubble — “Sign up free to keep going” + Sign up button (`onGetStarted`) + note about 7-day Pro trial on upgrade.
3. AICookingAssistant: same pattern for Free users — CTA to subscription view (“Start 7-day Pro trial”). Needs a callback prop or navigate helper already available in App.
4. i18n keys for EN/ZH.

## Scope

- GuestChatBox, AICookingAssistant (+ App wiring if needed)
- en.json / zh.json

## Rollback

Revert upsell branch; plain error returns.
