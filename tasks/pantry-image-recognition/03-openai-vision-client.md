# Task 03: OpenAI vision client

**Phase:** 1 — Backend foundation  
**Depends on:** 01  
**Blocks:** 04

## Description

Implement OpenAI gpt-4o vision call with structured JSON parse, truncate to 25 items, validate fields. No DeepSeek.

## Files

| Action | Path |
|--------|------|
| Create | `backend-node/src/pantry-vision/openai-vision.client.ts` |
| Create | `backend-node/src/pantry-vision/openai-vision.prompt.ts` |

## Acceptance criteria

- [ ] Accepts image buffer + mime → returns `RecognizedPantryItemDto[]`
- [ ] Throws clear error when key missing or API fails
- [ ] Empty/non-food → empty array (or handled by caller message)
