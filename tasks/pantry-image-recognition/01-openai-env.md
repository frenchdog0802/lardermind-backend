# Task 01: OpenAI vision env wiring

**Phase:** 1 — Backend foundation  
**Depends on:** None  
**Blocks:** 03, 04

## Description

Add optional `OPENAI_API_KEY`, `OPENAI_VISION_MODEL`, `OPENAI_VISION_TIMEOUT_MS` to Nest env schema and `app.optional`, document in `.env.example`.

## Files

| Action | Path |
|--------|------|
| Modify | `backend-node/src/config/env.schema.ts` |
| Modify | `backend-node/.env.example` |
| Modify | `backend-node/README.md` (optional one-liner) |

## Acceptance criteria

- [ ] App boots without OpenAI key set
- [ ] Key available on `app.optional.openaiApiKey` when present
- [ ] Defaults: model `gpt-4o`, timeout `60000`
