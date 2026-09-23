# Design: Web Agent Chat Transcript Style

**Feature:** [web-agent-chat-style.md](../features/web-agent-chat-style.md)

## 1. Where it fits

UI-only in [`frontend/src/components/AICookingAssistant.tsx`](../../frontend/src/components/AICookingAssistant.tsx).  
[`ChatMessageContent.tsx`](../../frontend/src/components/ChatMessageContent.tsx) unchanged unless class tweaks needed for prose on linen.

## 2. Visual spec

### User bubble
- `bg-herb text-white`, `rounded-2xl`
- `min-w-[4.5rem]`, `px-4 py-2.5` (sm: `py-3`)
- `max-w-[min(85%,28rem)]`
- Align end

### Assistant (default)
- No `bg-sage/40` fill
- `w-full` within parent `max-w-3xl` column
- `text-ink`, comfortable vertical rhythm (`space-y` on list already)
- Streaming caret / dots unchanged

### Assistant error
- Keep soft container: `bg-sage/50 border border-line text-herb-deep rounded-2xl px-4 py-3`

### Timestamp
- Wrap message row in `group`
- Visible: `opacity-0 group-hover:opacity-100` (+ `focus-within`)
- User: `text-white/70` when inside bubble; assistant: `text-muted`
- Include `<time>` with `dateTime` for a11y; keep formatted string

### Composer
- Omit `placeholder` (or empty)
- `aria-label={t('ai.title')}`
- Soft chrome: linen footer without heavy `border-t` (or hairline only)
- Field: `bg-surface`, `shadow-sm`, existing focus ring
- Send: transparent + muted when `!canSend`; `bg-herb` when ready

## 3. Risks

| Risk | Mitigation |
|------|------------|
| Assistant prose hard to scan vs bubbles | Keep clear vertical spacing (`space-y-6`–`8`) |
| Hover-only timestamp on touch | Accept for web; optional always-show later |

## 4. Non-goals

Mobile parity of transcript (separate), attach button on web, empty-state redesign.
