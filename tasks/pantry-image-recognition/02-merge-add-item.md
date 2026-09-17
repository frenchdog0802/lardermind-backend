# Task 02: Pantry mergeAddItem

**Phase:** 1 — Backend foundation  
**Depends on:** None  
**Blocks:** 04, 11

## Description

Add `PantryItemsService.mergeAddItem` per design: resolve ingredient by name, create or add quantity; same unit-kind converts then adds; else raw add fallback.

## Files

| Action | Path |
|--------|------|
| Modify | `backend-node/src/pantry-items/pantry-items.service.ts` |
| Create | `backend-node/src/pantry-items/pantry-items.service.spec.ts` (or extend) |

## Acceptance criteria

- [ ] New ingredient → create
- [ ] Existing + same unit → quantity summed
- [ ] Existing + convertible unit (g/kg) → converted then summed in existing unit
- [ ] Incompatible units → raw add fallback without throw
