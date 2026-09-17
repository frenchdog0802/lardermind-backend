# Task 09: Chat attach entry

**Phase:** 3 — Entry points  
**Depends on:** 05, 06, 07  
**Blocks:** 12

## Description

Attach control on chat composer; same pick → recognize → review. Image never sent to DeepSeek chat API.

## Files

| Action | Path |
|--------|------|
| Modify | `mobile/src/screens/AICookingAssistantScreen.tsx` |

## Acceptance criteria

- [ ] Attach opens picker → recognize → review
- [ ] No `/api/chat` call with image
- [ ] Discard leaves chat/pantry unchanged
