# RCA: Chat fails with "Chat provider request failed" (AI Gateway 401)

**Bug:** `docs/bugs/chat-ai-gateway-authenticated-401.md`  
**Status:** Confirmed via live Gateway probe + Worker code review  

---

## Root Cause

Cloudflare AI Gateway for this account is (or will remain) in **Authenticated Gateway** mode. In that mode, provider-native requests to `gateway.ai.cloudflare.com` require:

1. Provider credentials in `Authorization: Bearer <provider_key>`
2. Cloudflare AI Gateway token in `cf-aig-authorization: Bearer <cf_token>`

`backend-cf` only sends (1). Gateway therefore returns **401** (`AiGatewayError` / Unauthorized / internal **2009**). `streamCookingChat` maps any non-OK Gateway response to the SSE error message `Chat provider request failed`.

## Contributing Factors

1. Original AI Gateway design (`docs/design/backend-cf-ai-gateway-design.md`) documented only provider `Authorization`, not Authenticated Gateway.
2. Fixing `"Chat is not configured"` by adding `DEEPSEEK_API_KEY` advanced past the config gate, exposing the missing Gateway auth header.
3. No regression that asserts `cf-aig-authorization` is attached on Gateway fetches.

## Affected Components

- `backend-cf/src/agent/stream-chat.ts` (chat SSE)
- `backend-cf/src/lib/llm-chat.ts` (non-stream tool chat)
- `backend-cf/src/vision/recognize.ts` (OpenAI vision via same Gateway)
- Secrets / env: missing `CF_AIG_TOKEN` (new)

## Data / State Impact

- None on D1 / R2. Failed turns may still persist the user message before the Gateway call fails.

## Timeline

- Introduced with AI Gateway migration away from Workers AI (provider `fetch` without Gateway auth header).
- Surfaced after production `DEEPSEEK_API_KEY` was set (previously masked by `"Chat is not configured"`).

## Why it wasn't caught earlier

- Local/docs assumed Authenticated Gateway off, or never exercised production Gateway with auth on.
- Unit tests mock/stub Gateway helpers and do not hit a live authenticated Gateway.
