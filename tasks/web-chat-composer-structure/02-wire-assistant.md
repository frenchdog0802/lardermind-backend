# Task 02: Wire AICookingAssistant

**Phase:** 2  
**Depends on:** 01

## Goal

Replace inline `composerField` with `ChatComposer` in empty-stage and sticky footer. Move auto-grow into composer; keep parent focus via ref.

## Work

1. Import and render `ChatComposer` in both composer slots.
2. Remove obsolete wrapper JSX / local auto-grow effect / unused `canSend` if only used by composer.
3. Update `AICookingAssistant.composer.test.ts` for new wiring + keep timestamp regression.

## Acceptance

- [x] No inline composer chrome left in assistant
- [x] Focus-after-active / pending-prompt still uses textarea ref
- [x] Composer regression tests updated and green
