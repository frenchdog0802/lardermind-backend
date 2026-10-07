# Fix Design: Web chat composer double border

**Bug:** `docs/bugs/web-chat-composer-double-border.md`  
**RCA:** `docs/rca/web-chat-composer-double-border-rca.md`  

---

## Fix Approach

1. **Composer `textarea`:** add `border-0` so the field does not draw its own stroke; chrome stays on the rounded wrapper only.
2. **`index.css`:** move the global `input, textarea, select` rules into `@layer base` so Tailwind utilities (including `border-0`) can override them — correct Tailwind cascade and avoids needing `!important`.

This is the smallest fix that addresses both the double border and the cascade trap that would otherwise leave `border-0` ineffective.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| `!border-0` only | Works, but leaves unlayered global form CSS fighting utilities elsewhere |
| Remove global textarea border entirely | Breaks bare form fields that rely on it |
| `overflow-hidden` on wrapper only | Workaround — does not remove the square stroke source |
| Inline `style={{ border: 'none' }}` | Works but bypasses design-system classes |

## Scope of Change

- `frontend/src/index.css` — wrap form control defaults in `@layer base`
- `frontend/src/components/AICookingAssistant.tsx` — `border-0` on composer `textarea`
- `frontend/src/components/AICookingAssistant.composer.test.ts` — regression (source assertion)
- Docs: mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Revert the two source edits + test. Visual returns to double border.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Moving globals into `@layer base` changes override behavior for other inputs | Expected: utilities can now win; fields that only relied on global border still get it from base |
| Placeholder / focus ring regression | Keep existing `focus-within:ring-*` on wrapper; do not change outline rules in this fix |

## Regression Test Plan

1. **Unit (node:test):** Assert composer `textarea` `className` in `AICookingAssistant.tsx` includes `border-0`, and that `index.css` places the form-control border rule inside `@layer base`.
2. **Manual:** Chat composer — idle and focused — single rounded border, no square corner frame.

## Confirmation that root cause is fixed

Only the wrapper border is visible; `textarea` contributes no rectangular stroke; `border-0` wins over base-layer defaults.
