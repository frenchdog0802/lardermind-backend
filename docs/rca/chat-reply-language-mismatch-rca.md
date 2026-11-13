# RCA: English chat gets Chinese replies / tool item names

**Bug:** `docs/bugs/chat-reply-language-mismatch.md`  
**Status:** Confirmed via code inspection

## Root cause

The cooking assistant system prompt contains many Traditional Chinese examples and **does not** instruct the model to match the user’s message language. Tool descriptions likewise omit language constraints for `name`/`unit`, so the model defaults to ZH tokens from the prompt few-shot style. Auto-title already says “Match the user’s language”; the main chat path does not.

## Contributing factors

- Bilingual product history (ZH-first prompts).
- Guest landing forces English UI strings but chat completions still use the shared ZH-heavy system prompt.

## Affected components

- `buildCookingAssistantSystemPrompt` / `COOKING_ASSISTANT_SYSTEM_PROMPT`
- Pantry/shopping tool schemas in `definitions.ts`
- Downstream HITL cards showing tool args

## Data / state impact

None on DB; bad strings persist if user approves Chinese shopping/pantry writes.

## Why not caught earlier

Manual QA was often ZH; English landing demo only recently stressed.
