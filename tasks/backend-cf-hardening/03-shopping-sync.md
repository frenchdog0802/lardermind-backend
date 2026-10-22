# 03 — Shopping list idempotency and version

**Status:** done

## Work

- `version` column and DTO field
- Optional expected version → 409 `version_conflict` with `data.current`
- Optional `Idempotency-Key` on POST/PUT/DELETE

## Acceptance

- Create without the new header still returns 201 (existing tests)
- Same key twice returns the original row and does not insert again
- Stale version returns 409 and does not change the row
- Delete with a stale version returns 409 and leaves the row
