# Goal

Please implement the fix described in:

`docs/fixes/{bug-name}-fix.md`

---

# Input

Please read:

- `docs/bugs/{bug-name}.md`
- `docs/rca/{bug-name}-rca.md`
- `docs/fixes/{bug-name}-fix.md`

Related Files:

【List Files】

---

# Output

Complete:

- Fix implementation
- Regression test(s) that fail before the fix and pass after
- Edge-case tests uncovered during the fix
- Migration/backfill if required by the fix design
- Doc updates (mark bug Resolved)

---

# Rules

Must:

- Pass lint, type check, and full relevant test suite
- Fail-first: write failing repro test before applying the fix
- Minimal, related-file-only changes

Forbidden:

- Fixing only the symptom when RCA identified a root cause
- Silent behavior changes not in the fix design

---

# Steps

1. Write failing repro test
2. Confirm it fails for the expected root cause
3. Implement per fix design
4. Confirm test passes
5. Run broader tests + lint/types
6. Update trackers; close out `docs/bugs/{bug-name}.md`
