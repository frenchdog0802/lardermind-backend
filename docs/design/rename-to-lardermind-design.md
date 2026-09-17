# Design: LarderMind three-repo + CF-only

**Feature:** [rename-to-lardermind.md](../features/rename-to-lardermind.md)

## Target layout

```
D:\dev\LarderMind\                 ← git remote: lardermind-backend
├── docs/
├── tasks/
├── AGENTS.md
├── .cursor/rules/
├── .github/workflows/             ← backend-cf deploy
├── backend-cf/
├── README.md
├── frontend/                      ← separate git: lardermind-frontend (root .gitignore)
└── mobile/                        ← separate git: lardermind-mobile (root .gitignore)
```

## Removals

| Path | Action |
|------|--------|
| `landing/` | `git rm` + delete |
| `backend-node/` | `git rm -r` + delete |
| Root Docker/Nest quick-start | Remove or replace with `backend-cf` only |

## GitHub rename (operator)

| Old | New |
|-----|-----|
| `cookcopilot` | `lardermind-backend` |
| `cookcopilot-frontend` | `lardermind-frontend` |
| `cookcopilot-mobile` | `lardermind-mobile` |

Then `git remote set-url` on root, `frontend/`, `mobile/`.

## Risks

| Risk | Mitigation |
|------|------------|
| Clients still point at Nest/Render | Document cutover to Worker URL; Render rename still gated |
| Historical docs mention Nest | Leave deep history; fix entry-point README / status |
| Deleting `backend-node` is irreversible in working tree | Git history retains until force-pushed rewrite (we only delete files) |
