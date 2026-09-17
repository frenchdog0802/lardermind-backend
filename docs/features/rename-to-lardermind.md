# Feature: LarderMind three-repo + CF-only backend

**Status:** Implementing  
**Scope:** Split git ownership; root = docs/workflow + `backend-cf` only; remove Nest and landing  
**Out of scope:** Full rewrite of historical Nest migration docs; Render hostname rename (pending); physical rename of local folder

---

## 1. Summary

Stop treating the checkout as one app monorepo. Manage three GitHub remotes:

| Remote | Local | Contents |
|--------|-------|----------|
| `lardermind-backend` | repo root | `docs/`, `tasks/`, `AGENTS.md`, `.cursor/rules/`, `backend-cf/`, root README / CI |
| `lardermind-frontend` | `frontend/` (nested git, ignored by root) | Web app |
| `lardermind-mobile` | `mobile/` (nested git, ignored by root) | Expo app |

### Locked decisions

| Decision | Choice |
|----------|--------|
| Product name | LarderMind |
| API | **`backend-cf` only** — do not ship Nest |
| Nest `backend-node/` | **Delete** from this tree |
| `landing/` | **Delete** |
| Docs / tasks / AGENTS / Cursor rules | **Stay at root** (backend remote) |
| Frontend / mobile | Separate remotes; not tracked by root git |

---

## 2. Success criteria

- [ ] `landing/` and `backend-node/` removed from git tree
- [ ] Root README describes CF-only + three-repo layout
- [ ] `.cursor/rules/` tracked at root (not ignored)
- [ ] Operator can rename GitHub remotes to `lardermind-backend|frontend|mobile`

---

## 3. References

- Design: [rename-to-lardermind-design.md](../design/rename-to-lardermind-design.md)
- Tasks: [tasks/rename-to-lardermind/](../../tasks/rename-to-lardermind/)
