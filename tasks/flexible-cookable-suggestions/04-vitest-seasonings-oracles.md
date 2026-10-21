# Task 04: Fail-first Vitest for A1 / A2 / A3

**Phase:** A  
**Status:** Done  
**Blocked by:** 03

## Intent

Lock product oracles from the feature doc.

## Work

1. Extend `execute-suggest-cookable.test.ts` (or sibling):
   - **A1:** 排骨 in pantry; recipe 排骨+醬油+糖; assume ON → `conditionally_cookable`.
   - **A2:** 排骨 only; recipe 排骨+山藥+鹽 → `uncookable`; `missingMains` has 山藥.
   - **A3:** A1 pantry/recipe with assume OFF → not conditional; missing includes 醬油/糖.
2. Write failing assertions first if 03 incomplete; then green.

## Acceptance

- [ ] A1–A3 pass.
- [ ] Prior cookable-preference test still passes.
