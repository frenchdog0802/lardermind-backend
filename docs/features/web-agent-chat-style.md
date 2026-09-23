# Feature: Web Agent Chat Transcript Style

**Status:** Implemented  
**Scope:** Web (`frontend/`) — Chat message transcript + composer visual rhythm  
**Out of scope:** Mobile, backend, empty-state copy, drawer/nav, new attach features

**Design:** [web-agent-chat-style-design.md](../design/web-agent-chat-style-design.md)  
**Tasks:** [tasks/web-agent-chat-style/](../../tasks/web-agent-chat-style/)

---

## 1. Summary

Align the web Chat **transcript** with modern agent chat spatial rhythm while keeping Warm Kitchen branding.

Today short user messages collapse into chip-like bubbles, assistant replies sit in heavy sage bubbles, every timestamp is always visible, and the composer still shows a placeholder (mobile already removed it).

### Locked decisions

| Decision | Choice |
|----------|--------|
| Brand | Keep Warm Kitchen (linen / herb / Fraunces header) |
| User messages | Keep herb bubble; add min-width + comfortable padding |
| Assistant messages | Prose / document style — wide, no heavy fill bubble |
| Timestamps | Hidden by default; show on hover |
| Composer | No placeholder; send idle = ghost, ready = herb (parity with mobile intent) |
| Claude/ChatGPT skin | Do not copy dark/cold-white skins |

---

## 2. Requirements

1. Short user text (e.g. `c9`) must not look like a tiny chip.
2. Assistant replies read as a transcript column, not IM bubbles.
3. Timestamps do not clutter; available on hover (and screen-reader accessible).
4. Composer has no placeholder; `aria-label` remains.
5. Error assistant messages may keep a soft tinted container for clarity.

---

## 3. Acceptance

1. Short user bubble has stable padding / min width.
2. Normal assistant message has no sage fill bubble; uses full transcript column width within `max-w-3xl`.
3. Timestamp invisible until row hover (still in a11y tree).
4. Empty composer shows no placeholder text.
5. Warm Kitchen tokens only.
