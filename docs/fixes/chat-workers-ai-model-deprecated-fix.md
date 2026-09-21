# Fix Design: Chat returns Workers AI model deprecation error 5028

**Bug:** `docs/bugs/chat-workers-ai-model-deprecated.md`  
**RCA:** `docs/rca/chat-workers-ai-model-deprecated-rca.md`  

---

## Fix Approach

Switch the configured and fallback Workers AI model to the active same-family variant Cloudflare still serves:

**`@cf/meta/llama-3.1-8b-instruct-fast`**

1. Export a shared constant `DEFAULT_AI_MODEL` from `stream-chat.ts` (or a tiny `agent/models.ts`) set to the fast id; use it as the `env.AI_MODEL` fallback.
2. Update `backend-cf/wrangler.toml` `[vars] AI_MODEL` to the same id.
3. Update design doc references that still list the deprecated default.
4. After deploy / `wrangler dev --remote`, chat should no longer receive 5028 for this model.

This is the smallest fix: change the model id only; keep streaming, prompts, and SSE contract unchanged.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | Larger / different cost & latency; unnecessary for unblocking chat |
| External LLM via AI Gateway | New feature scope; not required to fix deprecation |
| Auto-alias / retry on 5028 | Symptom handling; still need an explicit active model |
| Leave wrangler var, only change code fallback | Deployed remote still sends deprecated `AI_MODEL` from vars |

## Scope of Change

- `backend-cf/src/agent/stream-chat.ts` — `DEFAULT_AI_MODEL` + fallback
- `backend-cf/wrangler.toml` — `AI_MODEL` var
- `backend-cf/src/agent/stream-chat.test.ts` (or models test) — fail-first: default/config must not be the deprecated id
- `docs/design/backend-cf-api-design.md` — default model string
- Docs: bug / rca / this fix; mark bug Resolved after implementation

## Data Migration / Backfill

None. If a Cloudflare dashboard **override** for `AI_MODEL` exists on the Worker, update or remove that override to match (wrangler.toml alone does not clear dashboard overrides).

## Rollback Plan

Revert `AI_MODEL` / `DEFAULT_AI_MODEL` to the previous id — chat would fail again with 5028. Prefer rolling forward to another catalog-active model if the fast variant regresses.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Fast variant response shape differs | Same family; existing `extractTokenText` already handles `response` / `content` / raw text |
| Pricing / latency change | Acceptable for P0 unblock; can retune `AI_MODEL` later without code changes |
| Dashboard override still deprecated | Note in fix + README; verify with one remote chat send after deploy |

## Regression Test Plan

1. **Fail-first unit test:** Assert exported `DEFAULT_AI_MODEL` is not `@cf/meta/llama-3.1-8b-instruct` and equals `@cf/meta/llama-3.1-8b-instruct-fast`. Optionally assert `wrangler.toml` `AI_MODEL` matches (read file in test).
2. **Manual:** `npm run dev:remote` (or deployed Worker) — send "Hi" in chat; expect streamed cooking reply, not 5028.
3. **Broader:** `npm test` in `backend-cf/`.

## Confirmation that root cause is fixed

`AI.run` is invoked with an active catalog model; Workers AI no longer returns 5028 for the deprecated llama-3.1-8b-instruct id.
