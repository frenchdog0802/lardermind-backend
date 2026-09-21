# Bug: Chat returns Workers AI model deprecation error 5028

**Status:** Resolved  
**Resolved by:** default / wrangler `AI_MODEL` → `@cf/meta/llama-3.1-8b-instruct-fast`  
**Fix design:** `docs/fixes/chat-workers-ai-model-deprecated-fix.md`  
**RCA:** `docs/rca/chat-workers-ai-model-deprecated-rca.md`  

---

## Current Behavior

Sending any message in chat (e.g. "Hi") returns an assistant bubble with Workers AI error text instead of a cooking reply:

```
5028: @cf/meta/llama-3.1-8b-instruct was deprecated on 2026-05-30. See the model catalog for alternatives: https://developers.cloudflare.com/workers-ai/models/
```

## Expected Behavior

The assistant should stream a normal cooking reply via `POST /api/chat/stream` (status → tokens → done).

## Reproduction Steps

1. Run mobile or web chat against `backend-cf` (`wrangler dev --remote` or deployed Worker).
2. Sign in so chat can attach a Bearer token.
3. Open AI Cooking Assistant / chat.
4. Send any message (reproduced with "Hi").
5. Observe the assistant bubble containing error code `5028` and the deprecated model id.

## Environment

- API: Cloudflare Worker chat stream (`backend-cf` `POST /api/chat/stream`)
- AI binding: Workers AI (`[ai] binding = "AI"`)
- Configured model: was `AI_MODEL = "@cf/meta/llama-3.1-8b-instruct"` in `backend-cf/wrangler.toml`
- Client: mobile chat UI (screenshot); web would surface the same SSE `error` event

## Related Files

- `backend-cf/wrangler.toml` — `[vars] AI_MODEL`
- `backend-cf/src/agent/stream-chat.ts` — `env.AI.run(model, …)` fallback default
- `backend-cf/src/env.ts` — `AI_MODEL` on `Env`
- `backend-cf/src/routes/chat.ts` — stream route

## Impact Scope

- Blocks all Workers AI chat replies for every client using `backend-cf`.
- Non-chat API routes are unaffected.

## Reproducibility Notes

- Screenshot shows the exact Cloudflare Workers AI deprecation message (error `5028`).
- Model id matches the repo default in `wrangler.toml` and `stream-chat.ts`.
- Cloudflare changelog: `@cf/meta/llama-3.1-8b-instruct` deprecated 2026-05-30; `-fast` variant remains active.

## Related Documents

- `docs/features/backend-cf-api.md`
- `docs/design/backend-cf-api-design.md`
- `tasks/backend-cf-api/06-chat-stream.md`
- https://developers.cloudflare.com/changelog/post/2026-05-08-planned-model-deprecations/
