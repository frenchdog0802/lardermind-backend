# Bug: Chat fails with "Chat provider request failed" (AI Gateway 401)

**Status:** Resolved  
**Resolved by:** `CF_AIG_TOKEN` + `cf-aig-authorization` on Gateway fetches; secret set + Worker deployed  
**Fix design:** `docs/fixes/chat-ai-gateway-authenticated-401-fix.md`  
**RCA:** `docs/rca/chat-ai-gateway-authenticated-401-rca.md`  

---

## Current Behavior

After `DEEPSEEK_API_KEY` is present on the deployed Worker, sending a chat message returns an assistant error bubble:

```
Chat provider request failed
```

Probing the same AI Gateway URL used by the Worker returns HTTP **401** with Cloudflare `AiGatewayError` / `Unauthorized` (internal code **2009**). Calling DeepSeek **directly** with the same API key succeeds (HTTP 200).

## Expected Behavior

`POST /api/chat/stream` should stream a normal cooking reply (status → tokens → done) while the Cloudflare AI Gateway remains in **Authenticated Gateway** mode.

## Reproduction Steps

1. Ensure production Worker has secrets `DEEPSEEK_API_KEY` (and optionally `OPENAI_API_KEY`) and vars `CF_ACCOUNT_ID` / `AI_GATEWAY_ID=default`.
2. Confirm Authenticated Gateway is enabled for gateway `default` (product preference: keep it on).
3. Sign in on mobile/web and send any chat message.
4. Observe assistant bubble: `Chat provider request failed`.
5. Optionally: `POST` to  
   `https://gateway.ai.cloudflare.com/v1/{CF_ACCOUNT_ID}/default/deepseek/chat/completions`  
   with only `Authorization: Bearer <DEEPSEEK_API_KEY>` → 401 Unauthorized.

## Environment

- API: `backend-cf` Worker `lardermind-api` (`POST /api/chat/stream`)
- Gateway: Cloudflare AI Gateway id `default`, account id from `wrangler.toml` `CF_ACCOUNT_ID`
- Client: mobile / web against `https://api.lardermind.com/api/`
- Auth preference: Authenticated Gateway **on**

## Related Files

- `backend-cf/src/agent/stream-chat.ts` — emits `Chat provider request failed` when Gateway response is not ok
- `backend-cf/src/lib/llm-chat.ts` — non-stream chat via Gateway
- `backend-cf/src/vision/recognize.ts` — OpenAI via same Gateway (same auth gap)
- `backend-cf/src/lib/ai-gateway.ts` — Gateway URL helpers
- `backend-cf/wrangler.toml` — `CF_ACCOUNT_ID` / `AI_GATEWAY_ID`

## Impact Scope

- Blocks all DeepSeek chat replies through AI Gateway when Authenticated Gateway is enabled.
- Pantry vision through the same Gateway is expected to fail the same way once attempted.

## Reproducibility Notes

- Distinct from earlier `"Chat is not configured"` (missing `DEEPSEEK_API_KEY`).
- Distinct from Workers AI model deprecation 5028 (chat no longer uses Workers AI).
- Direct DeepSeek API with the same key returns 200; failure is at the Gateway layer.

## Related Documents

- `docs/features/backend-cf-ai-gateway.md`
- `docs/design/backend-cf-ai-gateway-design.md`
- https://developers.cloudflare.com/ai-gateway/configuration/authentication/
