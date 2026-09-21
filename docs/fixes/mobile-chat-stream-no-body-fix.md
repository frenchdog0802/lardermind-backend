# Fix Design: Mobile chat shows "Stream response had no body"

**Bug:** `docs/bugs/mobile-chat-stream-no-body.md`  
**RCA:** `docs/rca/mobile-chat-stream-no-body-rca.md`  

---

## Fix Approach

Use Expo’s streaming Fetch for chat SSE only:

1. In `mobile/src/api/chat.ts`, change the stream request to:
   ```ts
   import { fetch as expoFetch } from 'expo/fetch';
   ```
   and call `expoFetch(...)` inside `streamSend` (leave non-stream `api` client on existing fetch unless needed elsewhere).
2. Keep existing SSE parser (`consumeSseStream` / `parseSseEvent`) unchanged.
3. Keep the `!response.body` guard as a safety net (should no longer fire on native when streaming works).

This is the smallest correct fix for the confirmed root cause: adopt the Expo-documented streaming client on the one code path that requires `ReadableStream`.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Fallback `response.text()` + parse full SSE when `body` is null | **Workaround** — loses true streaming; may OOM on long replies; still depends on RN buffering |
| XMLHttpRequest / `react-native-sse` | Extra dependency; Expo already ships `expo/fetch` |
| Replace global `fetch` app-wide | Broader risk (FormData/`file://` differences); out of scope |
| Non-stream `POST /chat/send` | CF stub returns 501; not a real fallback |
| Upgrade Expo so global fetch is `expo/fetch` | Not available/guaranteed on SDK 54; explicit import is correct and stable |

## Scope of Change

- `mobile/src/api/chat.ts` — use `expo/fetch` for `streamSend`
- `mobile/src/api/chat.stream.test.ts` (or similar) — fail-first regression: assert stream path uses expo fetch / handles ReadableStream body
- Docs: bug / rca / this fix; mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Revert `mobile/src/api/chat.ts` (and the new test) to global `fetch`. Error returns.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| `expo/fetch` differences vs RN fetch (headers, abort) | Scope to SSE only; AbortSignal already passed through |
| Jest cannot load native `expo/fetch` | Mock `expo/fetch` in the unit test; assert `streamSend` calls it and consumes body |
| Dev client / old binary without Expo fetch module | App already depends on `expo` ~54 with `expo-dev-client`; rebuild if native module missing |

## Regression Test Plan

1. **Fail-first unit test:** Mock global `fetch` to return `{ ok: true, body: null }` and mock `expo/fetch` to return a streaming body with a minimal SSE `done` event. Before the fix, if code still used global fetch, handlers get `'Stream response had no body'`. After the fix, `onDone` fires and expo fetch was called.
2. **Manual:** Android chat — send "What can I cook with what I have?" and confirm tokens/status then a real reply (not the error string).
3. **Broader:** `npm test` in `mobile/` for the package suite.

## Confirmation that root cause is fixed

`streamSend` calls `expo/fetch`, receives a non-null `response.body`, and SSE events are parsed. The `'Stream response had no body'` path is not taken for a successful native stream response.
