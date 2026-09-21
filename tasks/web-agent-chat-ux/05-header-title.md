# 05 — Session-aware header title (P1)

## Goal

Chat header title reflects empty vs active conversation.

## Acceptance

- [ ] `messages.length === 0` → title `t('nav.newChat')`
- [ ] Otherwise → current session title trimmed, else `t('nav.aiChat')`
- [ ] Truncates long titles (`truncate` already on AppHeader)
- [ ] Header hamburger + `+` New chat unchanged
- [ ] After New chat clears messages, title returns to New chat
