# RCA: Mobile chat shows "Stream response had no body"

**Bug:** `docs/bugs/mobile-chat-stream-no-body.md`  
**Status:** Confirmed via code inspection + Expo SDK 54 docs / runtime  

---

## Root Cause

`mobile/src/api/chat.ts` `chatApi.streamSend` uses the **global** `fetch` to call `POST …/chat/stream`, then requires `response.body` to be a `ReadableStream` for SSE consumption:

```ts
if (!response.body) {
  handlers.onError('Stream response had no body');
  return;
}
```

On Expo SDK **54**, the WinterCG runtime (`expo/src/winter/runtime.native.ts`) does **not** replace global `fetch` with `expo/fetch`. Global `fetch` remains React Native’s networking stack, which typically leaves **`response.body` as `null`** even when the HTTP response is `200` and the payload is available via `response.text()`.

Therefore every successful stream request on native still hits the null-body branch and surfaces the exact error string seen in the screenshot.

Expo documents the correct streaming client as:

```ts
import { fetch } from 'expo/fetch';
```

That API returns a WinterCG-compliant response whose `body` supports `getReader()` for SSE.

## Contributing Factors

1. **Backend SSE is fine for browsers** — `frontend/src/api/chat.ts` uses the same pattern; browsers expose `response.body`, so web can work while mobile fails.
2. **No mobile unit test** covering `streamSend` with a null `response.body` / verifying which `fetch` is used.
3. **Chat stream task** (`tasks/backend-cf-api/06-chat-stream.md`) targeted compatibility with the frontend client; mobile native streaming constraints were not locked down.
4. Later Expo SDK docs mention installing `expo/fetch` as global `fetch` on native; that is **not** true for this project’s SDK 54 runtime, which can mislead if reading “latest” docs only.

## Affected Components

| Component | Role |
|-----------|------|
| `mobile/src/api/chat.ts` | Uses global `fetch`; emits `'Stream response had no body'` |
| `mobile/src/screens/AICookingAssistantScreen.tsx` | Displays `onError` as assistant message |
| `expo/fetch` (SDK 54) | Available but unused by chat streaming |
| `backend-cf` chat stream | Produces SSE; not the source of this client error string |

## Data / State Impact

- User message may already be persisted by the Worker before/while streaming starts; failed client read can leave a user turn without a visible assistant reply in the UI session (DB may still have partial state depending on when the stream failed server-side).
- No schema change required for the fix.

## Timeline

Introduced when mobile chat switched to SSE `streamSend` against `response.body` without adopting `expo/fetch` on native. Present in current `mobile/src/api/chat.ts`.

## Why it wasn't caught earlier

- Web-first validation of `/api/chat/stream` succeeds with browser `fetch`.
- Jest/node test environment often provides a streaming `Response.body`, masking RN’s null-body behavior unless explicitly simulated.
- Error string is client-side only; backend logs look healthy for `200` SSE responses.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** Global RN `fetch` → `response.body === null` on native → exact client error path.
2. Less likely: Proxy/CDN strips body while returning 200 — would need empty/`text()` failure too; error string is specifically the null-body branch, and Expo 54 runtime confirms global fetch is not streaming-capable.
3. Less likely: Backend returns 200 with no body — Worker uses `sseResponse(stream)` with a `TransformStream`; web client would also fail.
4. Unlikely: Auth failure — would be `!response.ok`, not this message.

## Systemic pattern?

Any other mobile code that assumes global `fetch` + `response.body.getReader()` for streaming will fail the same way until it uses `expo/fetch` (or another streaming-capable client).
