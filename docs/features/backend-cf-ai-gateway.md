# Feature: backend-cf AI Gateway (DeepSeek chat + OpenAI vision)

**Status:** Implemented — set secrets and smoke-test chat + recognize  
**Scope:** `backend-cf/` — route LLM calls through **Cloudflare AI Gateway**; chat = **DeepSeek**, pantry image recognition = **OpenAI gpt-4o**  
**Out of scope:** LangGraph / tool calling, Unified Billing (CF-only keys), Nest restore, changing mobile/web SSE or pantry-vision client contracts

---

## 1. Summary

Replace Workers AI (`env.AI.run`) for chat with **DeepSeek** via AI Gateway. Add **pantry-vision** on the Worker (Nest is gone) using **OpenAI** vision via the same Gateway pattern. Clients keep existing URLs and envelopes.

**Why now:** Workers AI default model is deprecated (5028). Product intent is owned providers: DeepSeek for dialogue, OpenAI for image recognition. Target architecture already listed AI Gateway for external LLM traffic.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat provider | **DeepSeek** via Gateway | Product; OpenAI-compatible streaming |
| Vision provider | **OpenAI** (gpt-4o default) via Gateway | Match former Nest pantry-vision |
| Gateway URL style | Provider paths under `gateway.ai.cloudflare.com/v1/{account}/{gateway}/…` | Official DeepSeek/OpenAI provider docs; BYO provider API keys |
| Gateway id | Env `AI_GATEWAY_ID` default **`default`** | Auto-created gateway |
| SSE contract | Unchanged `token` / `status` / `done` / `error` | Mobile + web already parse this |
| Vision routes | `POST /api/pantry-vision/recognize`, `…/apply` | Match `mobile/src/api/pantryVision.ts` |
| Workers AI | Stop using for chat; binding may remain unused | Avoid 5028; no catalog dependency |

### What changes

| Area | Before | After |
|------|--------|-------|
| Chat inference | Workers AI model id | DeepSeek `chat/completions` stream via AI Gateway |
| Pantry vision | Missing on CF (404) | OpenAI vision via AI Gateway + apply merge |
| Secrets | `JWT_SECRET` (+ Google) | + `DEEPSEEK_API_KEY`, `OPENAI_API_KEY` |
| Config | `AI_MODEL` Workers id | `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`, `LLM_MODEL`, `OPENAI_VISION_*` |

---

## 2. Success criteria

- [x] `POST /api/chat/stream` streams tokens from DeepSeek through AI Gateway (no Workers AI 5028)
- [x] Missing `DEEPSEEK_API_KEY` → clear SSE `error` / no secret leak
- [x] `POST /api/pantry-vision/recognize` returns draft items via OpenAI; quota enforced before call
- [x] `POST /api/pantry-vision/apply` merge-adds pantry rows; no second quota hit
- [x] Unit tests for gateway URL builder, stream delta parse, vision JSON parse, apply validation
- [x] README / `.dev.vars.example` document required secrets and vars

**Status:** Implemented — set secrets and smoke-test chat + recognize.

---

## 3. Non-goals

- HITL / LangGraph tool loop
- Cloudflare Unified Billing (no provider keys)
- Web pantry-vision UI
- Removing the unused Workers AI binding in the same change (optional cleanup)

---

## 4. References

- `docs/architecture/cloudflare-target.md` (AI Gateway target)
- `docs/features/pantry-image-recognition.md` / design (contract)
- `docs/bugs/chat-workers-ai-model-deprecated.md`
- https://developers.cloudflare.com/ai-gateway/usage/providers/deepseek/
- https://developers.cloudflare.com/ai-gateway/usage/providers/openai/
