# Task 07: Post-sync undo and uncheck-synced confirm

**Feature:** shopping-pantry-batch-sync  
**Depends on:** 04, 05, 06  
**Files:** Web + mobile shopping list / toast components

## Goal

Recovery paths after mistaken sync or uncheck of synced items.

## Work

1. After successful sync, toast **已將 N 項加入庫存** + **復原** (~10s).
2. Undo calls `unsyncFromPantry` with ids from last batch; refresh contexts.
3. When unchecking a row with `synced_to_pantry`, confirm dialog:
   - Yes → unsync then uncheck
   - No → uncheck only (pantry unchanged)

## Acceptance criteria

- [ ] Undo within window reverts pantry and clears sync flags
- [ ] Uncheck confirm matches design §6.5
- [ ] Toast dismiss does not block future syncs
