# Fix: English chat gets Chinese replies / tool item names

**Bug:** `docs/bugs/chat-reply-language-mismatch.md`  
**RCA:** `docs/rca/chat-reply-language-mismatch-rca.md`

## Fix approach

1. Add an explicit **Language** section to `COOKING_ASSISTANT_SYSTEM_PROMPT`: reply in the user’s latest message language; keep tool `name`/`unit` in that language; do not switch to Chinese examples when the user writes English (and vice versa).
2. Append one-line language hints on `addPantryItems` / `addItemsToShoppingList` (and related mutate) tool descriptions.
3. Fail-first unit test: built prompt must match language rules.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Detect locale from `appLanguage` and inject | UI language ≠ message language; guest landing already English UI with possible ZH prefs elsewhere |
| Post-process translate tool args | Fragile; needs another LLM call |

## Scope

- `backend-cf/src/agent/system-prompt.ts` (+ test)
- `backend-cf/src/agent/tools/definitions.ts` (short description tweaks)

## Rollback

Revert prompt + definition strings.

## Regression plan

1. Source test for language clause.
2. Manual: EN prompt → EN reply + EN shopping names; ZH prompt still ZH.
