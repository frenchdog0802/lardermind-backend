# RCA: Chat returns Workers AI model deprecation error 5028

**Bug:** `docs/bugs/chat-workers-ai-model-deprecated.md`  
**Status:** Confirmed via config + Cloudflare deprecation changelog  

---

## Root Cause

`backend-cf` invokes Workers AI with model id `@cf/meta/llama-3.1-8b-instruct`:

1. `wrangler.toml` sets `AI_MODEL = "@cf/meta/llama-3.1-8b-instruct"`.
2. `stream-chat.ts` falls back to the same id when `env.AI_MODEL` is empty.

Cloudflare deprecated that model on **2026-05-30**. Calls now fail with AiError **5028**, which `streamCookingChat` catches and emits as an SSE `error` event; clients render that message as the assistant bubble.

Cloudflare lists `@cf/meta/llama-3.1-8b-instruct-fast` as an active same-family replacement.

## Contributing Factors

1. Default model was pinned at scaffold time and never revisited after CF’s May 2026 catalog refresh.
2. No automated check that `AI_MODEL` / code default is still in the active catalog.
3. Deprecation is platform-side; local unit tests that mock `AI.run` would not see 5028.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/wrangler.toml` | Deployed / remote-dev `AI_MODEL` var |
| `backend-cf/src/agent/stream-chat.ts` | Hardcoded fallback model id; calls `env.AI.run` |
| Chat clients (mobile / web) | Display SSE `error.message` as assistant text |

## Data / State Impact

- User message and AI usage increment may already be written before `AI.run` throws.
- Failed turns can leave a user message without a successful assistant reply in DB (error path does not insert assistant text).
- No schema migration required.

## Timeline

- Default introduced with `backend-cf` chat stream (task 06).
- Became a hard failure after Cloudflare’s 2026-05-30 deprecation (today’s date is past that cutoff).

## Why it wasn't caught earlier

- Model worked until the platform cutoff date.
- Chat E2E against Workers AI is often skipped in CI (needs CF account / remote binding).
- Design docs documented the then-current default without a “verify catalog” checklist.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** Configured/default model id is deprecated → 5028 from Workers AI.
2. Unlikely: Wrong binding / billing — message explicitly names this model and deprecation date.
3. Unlikely: Client-only bug — error text is the server SSE payload from `catch` in `stream-chat.ts`.
