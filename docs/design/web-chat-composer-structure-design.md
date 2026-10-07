# Design: Web Chat Composer Structure

**Feature:** [web-chat-composer-structure.md](../features/web-chat-composer-structure.md)

---

## 1. Architecture

```
AICookingAssistant
  └─ ChatComposer (forwardRef → textarea)
       ├─ Wrapper div — only chrome (border / radius / shadow / surface)
       ├─ Bare textarea — value, auto-grow, Enter send
       └─ Send button — absolute bottom-right
```

Parent owns session/send/HITL/`inputValue` / `isTyping`. Composer owns local `focused` and height auto-grow.

## 2. Component API

```ts
type ChatComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  ariaLabel: string;
  maxHeightPx?: number; // default 240
};
```

`forwardRef<HTMLTextAreaElement, ChatComposerProps>` so parent keeps `inputRef.current?.focus()`.

## 3. Chrome rules

| Piece | Implementation |
|-------|----------------|
| Wrapper | `relative flex items-end rounded-[22px] bg-surface shadow-sm min-h-[52px] border` + `borderColor: focused ? herb : line` (class or style; no `focus-within:*`) |
| Textarea | Classes: `border-0 bg-transparent … focus:outline-none focus-visible:outline-none`; **inline** `style={{ border: 'none', outline: 'none', boxShadow: 'none' }}` |
| Send | `canSend = Boolean(value.trim()) && !disabled`; muted / herb as today |
| Avoid | `focus-within:ring-*`, `focus-within:border-*` |

## 4. Behavior

1. `onFocus` → `focused = true`; `onBlur` → `focused = false`.
2. Enter (no Shift) → `preventDefault` + `onSend` when sendable (or always call parent; parent no-ops if empty).
3. Auto-grow: reset height to `0` then `min(scrollHeight, maxHeightPx)` on `value` change.
4. No placeholder attribute.

## 5. Wire-up

In `AICookingAssistant.tsx`:

- Remove inline `composerField` JSX, auto-grow `useEffect`, and local `canSend` if unused elsewhere.
- Render `<ChatComposer ref={inputRef} value={…} onChange={…} onSend={handleSendMessage} disabled={isTyping} ariaLabel={t('ai.title')} />` in empty-stage and sticky footer.

## 6. Tests

New `ChatComposer.test.ts` (node:test, source asserts):

- No `focus-within:ring-` / `focus-within:border-` on wrapper.
- Focused border driven by `focused` state (herb vs line).
- Textarea inline chrome reset present.

Update / thin `AICookingAssistant.composer.test.ts` to assert assistant wires `ChatComposer` and keep timestamp regression.

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Inline style fights design system | Scoped to composer bare field only; intentional isolation |
| Ref break after extract | `forwardRef` + existing focus effects unchanged |
| Double border if wrapper + textarea both stroke | Tests + inline reset |

## 8. Non-goals

Mobile changes; attach button; changing global `*:focus-visible` for the whole app.
