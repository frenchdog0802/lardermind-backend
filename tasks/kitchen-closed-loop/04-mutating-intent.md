# Task 04: Mutating-intent for pantry delete / reduce

**Phase:** 1  
**Goal:** ZH/EN phrases like 「刪除排骨」「減 3 包」flag mutating intent so the loop requires a tool call.

## Steps

1. Extend `mutating-intent.ts` patterns for:
   - ZH: 刪除 / 移除 / 扣掉 / 減少 / 減量 + 庫存/食材/排骨-style pantry domain (reuse existing domain group)
   - EN: remove / delete / reduce / subtract + pantry/inventory
2. Add unit cases in `mutating-intent.test.ts` (positive + ensure read-only 「庫存有什麼」 still false)

## Acceptance

- [ ] 「幫我刪除 10 包排骨」→ `looksLikeMutatingUserRequest` true
- [ ] 「排骨減 3 包」→ true
- [ ] 「我庫存有什麼」→ false
