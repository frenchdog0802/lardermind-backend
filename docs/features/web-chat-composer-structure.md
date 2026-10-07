# Feature: Web Chat Composer Structure

**Status:** Implemented  
**Scope:** Web (`frontend/`) — Chat composer chrome ownership and component structure  
**Out of scope:** Mobile, backend, visual redesign (new shape/colors/attach), global `index.css` a11y outline for other controls

**Design:** [web-chat-composer-structure-design.md](../design/web-chat-composer-structure-design.md)  
**Tasks:** [tasks/web-chat-composer-structure/](../../tasks/web-chat-composer-structure/)

---

## 1. Summary

Rebuild the web Chat composer as a self-contained `ChatComposer` that **owns its border via React focus state** (parity with mobile `composerFocused`), so global form / `*:focus-visible` CSS can no longer paint a second frame on click.

Warm Kitchen look stays the same: rounded pill field, surface fill, soft shadow, herb send when ready.

### Locked decisions

| Decision | Choice |
|----------|--------|
| Approach | Structural extract + focus-state border (not more CSS cascade patches) |
| Border owner | Outer wrapper only; driven by `focused` boolean |
| Textarea | Fully bare + inline chrome reset (`border` / `outline` / `boxShadow` none) |
| Focus cue | Herb border on wrapper when focused; no `focus-within:ring-*` / `focus-within:border-*` |
| Send | Idle: muted ghost; ready: herb fill (unchanged) |
| Auto-grow | Lives inside `ChatComposer` |
| Attach | Web: none (mobile-only) |

---

## 2. Requirements

1. Extract presentational `ChatComposer` used by empty-stage and sticky footer.
2. Wrapper is the only visible frame; textarea draws no border/outline/ring.
3. Focus toggles wrapper border color via `onFocus` / `onBlur` (not CSS `:focus-within` chrome).
4. Preserve Enter-to-send, Shift+Enter newline, disabled-while-typing, `aria-label`, no placeholder.
5. Parent can still focus the field (e.g. after pending prompt) via ref.

---

## 3. Acceptance

1. Clicking the composer shows a single rounded border; no dark outline flash.
2. Idle and focused states differ only by wrapper border tint (line → herb).
3. Empty + transcript footers both render the same `ChatComposer`.
4. Send affordance matches prior behavior.
5. Regression tests assert chrome ownership on `ChatComposer` source.
