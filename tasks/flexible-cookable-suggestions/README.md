# Tasks: flexible-cookable-suggestions

**Feature:** [docs/features/flexible-cookable-suggestions.md](../../docs/features/flexible-cookable-suggestions.md)  
**Design:** [docs/design/flexible-cookable-suggestions-design.md](../../docs/design/flexible-cookable-suggestions-design.md)

| Phase | Focus | Status |
|-------|--------|--------|
| A | Conditionally cookable + seasonings toggle | **Done** |
| B | Unit conversion table + define_unit card + re-suggest | **Done** |

See `checklist.md` / `progress.md`.

## Manual smoke

1. Settings → Preferences → toggle「預設家裡有基本調味料」OFF/ON; ask「可以煮什麼」and confirm conditional vs strict.
2. Pantry `排骨` in 包 + recipe needing 排骨 in g → meal card shows define-unit input; submit ratio → hidden re-suggest refreshes cookability.
