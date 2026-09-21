# 04 — Suggestion cards (P1)

## Goal

Replace vertical full-round pills with a 2×2 short-label card grid.

## Acceptance

- [ ] `ChatEmptyState` consumes `suggestedPromptCards` (`title` + `prompt`)
- [ ] Grid `grid-cols-2`; cards `rounded-xl` (not `rounded-full`)
- [ ] Visible label = `title`; `onSelectPrompt(prompt)` uses full `prompt`
- [ ] Soft-fail if i18n shape invalid (no grid)
- [ ] `AICookingAssistant` loads cards via `t('ai.suggestedPromptCards', { returnObjects: true })` with array guard
- [ ] Remove obsolete `suggestedPrompts` prop from empty state once unused
