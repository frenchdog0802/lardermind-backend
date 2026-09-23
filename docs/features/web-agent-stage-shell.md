# Feature: Web Agent Stage Shell

**Status:** Implemented  
**Scope:** Web authenticated shell + Chat stage (`frontend/`)  
**Out of scope:** Mobile app, theme token change (Warm Kitchen stays), backend, landing/demo

**Design:** [web-agent-stage-shell-design.md](../design/web-agent-stage-shell-design.md)  
**Tasks:** [tasks/web-agent-stage-shell/](../../tasks/web-agent-stage-shell/)

---

## 1. Summary

Close the gap vs modern agent UIs (Gemini-class) **without changing brand theme**:

1. **Desktop persistent nav rail** (always visible); **mobile stays overlay** drawer.
2. **Chat stage**: empty state is a centered hero (large greeting + floating composer); with messages, composer docks bottom; warm linen atmosphere + stronger transcript type.

### Locked decisions

| Decision | Choice |
|----------|--------|
| Theme | Warm Kitchen unchanged (no dark Gemini skin) |
| Desktop nav | **Persistent left rail** (~16–20rem), open by default |
| Mobile nav | **Overlay** drawer (hamburger), closed by default |
| Empty Chat | Centered greeting + composer mid-stage |
| Active Chat | Transcript column + bottom composer |
| Desktop hamburger | **Hidden** while rail visible |
| Navigate on rail | Do not “close” rail |

---

## 2. Acceptance

1. `md+`: rail always visible beside content; Recents load without opening a drawer.
2. `<md`: hamburger opens overlay; backdrop + Esc close.
3. Empty Chat: large display greeting; composer centered under it (not stuck only at bottom).
4. With messages: composer at bottom; assistant text larger / more readable.
5. Soft warm radial atmosphere on Chat (not purple).
