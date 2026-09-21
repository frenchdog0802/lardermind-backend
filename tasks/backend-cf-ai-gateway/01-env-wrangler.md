# Task 01: Env + wrangler + `.dev.vars.example`

Add `CF_ACCOUNT_ID`, `AI_GATEWAY_ID`, `LLM_MODEL`, `OPENAI_VISION_*` vars; document `DEEPSEEK_API_KEY` / `OPENAI_API_KEY` secrets. Update `Env` type.

## Acceptance

- [ ] `env.ts` includes new fields (keys optional string)
- [ ] `wrangler.toml` vars set (account id + defaults)
- [ ] `.dev.vars.example` lists secrets without real values
