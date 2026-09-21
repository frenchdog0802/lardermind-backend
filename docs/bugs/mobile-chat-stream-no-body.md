# Bug: Mobile chat shows "Stream response had no body"

**Status:** Resolved  
**Resolved by:** `chatApi.streamSend` uses `expo/fetch` for SSE  
**Fix design:** `docs/fixes/mobile-chat-stream-no-body-fix.md`  
**RCA:** `docs/rca/mobile-chat-stream-no-body-rca.md`  

---

## Current Behavior

On the mobile app chat screen, sending a message (e.g. "What can I cook with what I have?") returns an assistant bubble with the exact text **"Stream response had no body"** instead of a streamed cooking reply. The HTTP request appears to succeed enough for the client to reach its "ok but no body" path (not a generic network error).

## Expected Behavior

The assistant should stream token events from `POST …/chat/stream` and show a normal cooking reply (status → tokens → done), matching the web client behavior for the same endpoint.

## Reproduction Steps

1. Run the Expo mobile app (`mobile/`) against a backend that serves `POST /api/chat/stream` (local Worker or deployed CF API).
2. Sign in so chat can attach a Bearer token.
3. Open Chat / AI Cooking Assistant.
4. Send any message (reproduced with "Hello" then "What can I cook with what I have?").
5. Observe the assistant reply text: `Stream response had no body`.

## Environment

- App: `mobile/` (Expo ~54 / React Native 0.81)
- OS: Android (screenshot from device/emulator chat UI; iOS may share the same client path)
- API: Cloudflare Worker chat stream (`backend-cf` `POST /api/chat/stream`)
- Client path: `mobile/src/api/chat.ts` → `chatApi.streamSend`

## Related Files

- `mobile/src/api/chat.ts` — throws/surfaces `'Stream response had no body'` when `response.ok && !response.body`
- `mobile/src/screens/AICookingAssistantScreen.tsx` — `handleSend` → `chatApi.streamSend` / `onError` as assistant message
- `backend-cf/src/routes/chat.ts` — stream route
- `backend-cf/src/agent/stream-chat.ts` — SSE producer
- `frontend/src/api/chat.ts` — web equivalent (same error string if body missing)

## Impact Scope

- Blocks core chat / cooking-assistant UX on mobile for every streamed send.
- Web may still work if browser `fetch` exposes `response.body`.
- Non-stream REST chat endpoints (`chat/send`) are stubbed 501 on CF and are not a usable fallback today.

## Reproducibility Notes

- Screenshot confirms the exact client error string from `mobile/src/api/chat.ts`.
- Code path only emits that string when `response.ok` is true and `response.body` is falsy.
- Physical or emulator Android build with streaming chat is sufficient to reproduce; no special pantry state required.

## Additional Information Needed (optional)

- Whether web chat against the same API base URL succeeds at the same time
- Exact `EXPO_PUBLIC_API_BASE_URL` used in the failing build

## Related Documents

- `docs/features/chat-langgraph.md` (SSE contract / mobile client)
- `docs/features/backend-cf-api.md`
- `tasks/backend-cf-api/06-chat-stream.md`
