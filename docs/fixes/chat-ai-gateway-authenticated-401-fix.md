# Fix Design: Chat AI Gateway Authenticated 401

**Bug:** `docs/bugs/chat-ai-gateway-authenticated-401.md`  
**RCA:** `docs/rca/chat-ai-gateway-authenticated-401-rca.md`  

---

## Fix Approach

Keep **Authenticated Gateway on**. Teach the Worker to send Cloudflare’s Gateway auth header on every provider-native Gateway `fetch`:

1. New secret `CF_AIG_TOKEN` (Dashboard: AI Gateway → Create authentication token with **Run** permission).
2. Central helper on `ai-gateway.ts` builds headers:
   - `Authorization: Bearer <provider_key>`
   - `cf-aig-authorization: Bearer <CF_AIG_TOKEN>` when token present
3. Require `CF_AIG_TOKEN` (trimmed) together with provider key for chat/vision “configured” checks — fail with existing `"Chat is not configured"` / `VisionNotConfiguredError` instead of opaque provider 401.
4. Wire helper into `stream-chat.ts`, `llm-chat.ts`, and `vision/recognize.ts`.
5. Document secret in `wrangler.toml` comments, `.dev.vars.example`, and `backend-cf/README.md`.

Why this over turning auth off: matches product preference (Authenticated on) and closes the public Gateway surface.

## Alternatives Considered

| Option | Pros | Cons | Decision |
|--------|------|------|----------|
| Disable Authenticated Gateway | Zero code change | Weaker; rejected by product | Rejected |
| AI Gateway Worker binding | Auto-auth inside CF | Larger binding/API change | Out of scope |
| Call DeepSeek/OpenAI directly (bypass Gateway) | Avoids Gateway auth | Loses Gateway logging/limits; redesign | Rejected |

## Scope of Change

- `backend-cf/src/lib/ai-gateway.ts` (+ tests)
- `backend-cf/src/env.ts`
- `backend-cf/src/agent/stream-chat.ts`
- `backend-cf/src/lib/llm-chat.ts`
- `backend-cf/src/vision/recognize.ts`
- Docs: bug status, README, `.dev.vars.example`, `wrangler.toml` comments
- Ops: set `CF_AIG_TOKEN` via `wrangler secret put` and local `.dev.vars`

## Data Migration / Backfill Needs

None.

## Rollback Plan

1. Revert Worker deploy, or remove `cf-aig-authorization` helper usage.
2. Temporarily disable Authenticated Gateway if chat must work before redeploy.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Token missing after deploy | Configured checks → clear “not configured” error |
| Wrong token permissions | Dashboard token must include AI Gateway **Run** |
| Header breaks auth-off gateways | CF docs: auth off + header present still succeeds |

## Regression Test Plan

1. Unit: header helper includes both Bearer headers when `CF_AIG_TOKEN` set; omits Gateway header when empty; configured checks fail without token.
2. Existing `backend-cf` test suite passes.
3. Manual: after `wrangler secret put CF_AIG_TOKEN`, send one production chat message and confirm tokens stream.
