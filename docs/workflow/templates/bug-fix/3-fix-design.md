# Goal

Based on `docs/rca/{bug-name}-rca.md`, design a fix for the confirmed root cause.

---

# Input

Please read:

- `docs/bugs/{bug-name}.md`
- `docs/rca/{bug-name}-rca.md`
- related design docs

---

# Output

Please generate:

`docs/fixes/{bug-name}-fix.md`

Include at least:

- Fix Approach (and why over alternatives)
- Alternatives Considered
- Scope of Change
- Data Migration / Backfill Needs
- Rollback Plan
- Risk Assessment
- Regression Test Plan

---

# Rules

- Prefer the smallest fix that addresses the root cause
- Flag architectural rewrites as options, not defaults
- Symptom-only changes must be labeled **workaround**, not fix
- Do not begin implementation in this step
