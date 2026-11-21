# Fix design: D1 LIKE pattern too complex

## Approach
Replace `LOWER(col) LIKE LOWER(?)` with `INSTR(LOWER(col), LOWER(?)) > 0` and bind the raw trimmed text. Same case-insensitive substring semantics, no pattern (no size limit), and `%`/`_` are now literal.

## Alternatives rejected
- Exact match only: would change search behaviour (substring) for the list endpoints.
- Chunking/JS matching: more code and loads full tables for no gain.

## Scope
5 db list functions. No schema change, no API change. Rollback = revert commit.

## Regression plan
`src/db/like-pattern-limit.test.ts`; `test-utils/sqlite-d1.ts` now emulates D1's 50-byte LIKE/GLOB limit so any reintroduction fails locally.
