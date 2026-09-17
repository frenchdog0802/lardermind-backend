# LarderMind development workflow (source of truth)

**This directory is the project source of truth** for how agents and humans ship work.  
External prompts under `d:\dev\AI workflow\` are historical references; **prefer this doc** when they disagree.

Cursor enforces this via [`.cursor/rules/dev-workflow.mdc`](../../.cursor/rules/dev-workflow.mdc) and [`AGENTS.md`](../../AGENTS.md).

---

## Hard rules

1. **Adding a new feature MUST use the new feature flow** (requirements → design → tasks → code).
2. **Fixing a bug MUST use the bug fix flow** (bug report → RCA → fix design → code).
3. Skipping docs is **not allowed** for features or bugs (even if someone says “直接寫”).
4. **If you encounter a problem → ask the user first** (do not guess or silently change scope).
5. **Otherwise → finish the task** end-to-end (do not stop early on clear work).

## Choose a flow

| Situation | Flow |
|-----------|------|
| Existing behavior is wrong (actual ≠ expected) | **Bug fix** (required) |
| New capability, redesign, migration, or new product contract | **New feature** (required) |
| Greenfield project / major reboot from scratch | **Project startup** |
| Typo, one-line, no behavior/API/schema/UX contract change | **Skip formal flow** — fix directly |

**Default for ambiguous “big change” requests (UI shell, nav, new API surface): New feature.** Do not jump to coding.

---

## New feature flow

Do **not** implement until steps 1–3 exist and are aligned.

| Step | Output | Purpose |
|------|--------|---------|
| 1. Requirements | `docs/features/{feature-name}.md` | What / why / scope / out of scope / edge cases |
| 2. Design | `docs/design/{feature-name}-design.md` | Architecture, APIs, data, flows, risks |
| 3. Tasks | `tasks/{feature-name}/` | Small tasks + `README.md`, `progress.md`, `checklist.md` |
| 4. Coding | Code + tests | One task at a time; update checklist/progress |

Templates: [templates/feature/](./templates/feature/).

Examples in repo: `docs/features/pantry-image-recognition.md`, `docs/features/backend-cf-api.md`, `tasks/backend-cf-api/`.

---

## Bug fix flow

Do **not** implement until steps 1–3 exist. Prefer smallest fix for the **confirmed root cause**.

| Step | Output | Purpose |
|------|--------|---------|
| 1. Bug report | `docs/bugs/{bug-name}.md` | Current vs expected, repro, severity — **no root-cause guessing** |
| 2. RCA | `docs/rca/{bug-name}-rca.md` | Confirmed root cause + contributing factors |
| 3. Fix design | `docs/fixes/{bug-name}-fix.md` | Approach, alternatives, scope, rollback, regression plan |
| 4. Coding | Code + regression tests | Fail-first test → fix → full suite; mark bug resolved |

Templates: [templates/bug-fix/](./templates/bug-fix/).

Example: `docs/bugs/android-bottom-nav-overlap.md` (+ rca + fix).

---

## Project startup flow

For a new product / empty scaffold (rare inside this monorepo):

1. `docs/proposal.md` (requirements)  
2. Detailed design  
3. Task breakdown  
4. Master / coding prompts  

Templates live historically under `d:\dev\AI workflow\project startup prompt\`. Prefer adapting the **new feature** flow for work inside LarderMind.

---

## Agent rules (non-negotiable)

1. **Classify first** — feature vs bug vs skip — before writing product code.
2. **New feature → feature flow only; bug → bug-fix flow only.** No exceptions for “quick” work.
3. **Docs before code** — finish steps 1–3 before any product-code change.
4. **Problem → ask user first**; otherwise **finish the task**. Do not invent decisions when blocked; do not pause when the path is clear.
5. **Minimal diffs** — no drive-by refactors outside the task/fix design.
6. **Update trackers** — `tasks/.../progress.md` + `checklist.md`, or bug status → Resolved.
7. **Path convention** — use `docs/design/` (not `docs/designs/`) to match this repo.

---

## Quick start phrases

- “走 new feature flow：【功能名】”  
- “走 bug fix flow：【問題名】”  
- “依 docs/workflow 分類後再動手”
