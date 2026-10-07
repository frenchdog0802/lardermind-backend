# Fix Design: Chat claims pantry add but inventory empty

**Bug:** `docs/bugs/chat-pantry-add-claimed-but-empty.md`  
**RCA:** `docs/rca/chat-pantry-add-claimed-but-empty-rca.md`  

---

## Fix Approach

Server-side guard in the agent tool loop (smallest fix that stops false “saved” copy):

1. **Detect mutating user intent** (heuristic on the latest user message: write verbs + pantry / inventory / shopping / recipe / meal-plan domain, ZH + EN).
2. When the model returns **no `tool_calls`** on such a request and no tools have run yet this turn:
   - **Nudge once:** append a corrective user message (“You must call a tool; do not claim data was saved”) and call the LLM again with tools; prefer `tool_choice: 'required'` on that retry when the API supports it.
   - If the retry still has no tool calls: return an honest `text` reply that **nothing was changed**, and **do not** forward the hallucinated success text.
3. **Harden system prompt:** never claim pantry/shopping/recipe/meal-plan/preferences were updated unless the corresponding tool ran in this turn; for change requests, call a tool first.

Read-only questions (“what’s in my pantry?”) stay on `tool_choice: 'auto'` and are unaffected by the mutating-intent heuristic.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Prompt-only hardening | Models still skip tools intermittently |
| Always `tool_choice: 'required'` | Breaks pure Q&A / cooking advice turns |
| Client-only: hide success unless `pantry_updated` | Workaround; false text still stored in history |
| Disable chat pantry adds | Product regression; tools already designed for this |

## Scope of Change

- `backend-cf/src/agent/system-prompt.ts` — anti-hallucination write rules
- `backend-cf/src/agent/tools/mutating-intent.ts` (or equivalent) — `looksLikeMutatingUserRequest`
- `backend-cf/src/lib/llm-chat.ts` — optional `toolChoice` on `completeChat`
- `backend-cf/src/agent/agent-loop.ts` — nudge / discard false success
- `backend-cf/src/agent/agent-loop.test.ts` — fail-first regression cases
- Docs: mark bug Resolved after implementation

No frontend change required for the root cause (HITL + refresh already work when tools run).

## Data Migration / Backfill

None. Optional: users with false success messages in history may need to re-add items manually.

## Rollback Plan

Revert the agent/prompt/llm-chat changes. Behavior returns to text-only false successes.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Heuristic false positive on “how do I add to pantry?” | Phrase requires write verb + domain; educational questions often lack “add X to pantry” imperative — monitor; nudge still allows model to call a tool or explain |
| `tool_choice: 'required'` unsupported by gateway | Fall back to `'auto'` + nudge text; still discard second text-only invent |
| Extra LLM round latency | At most one nudge per mutating turn when tools were skipped |

## Regression Test Plan

1. **Vitest:** Mutation user message → first completion text-only false success → second completion `addPantryItems` → expect `interrupt` (not complete with success text).
2. **Vitest:** Same, but both completions text-only → expect `complete` with honest non-save message; response must not be the first hallucinated string.
3. **Vitest:** Non-mutating “what’s in pantry?” with text-only (no tools) still completes (existing / listPantry happy path unchanged).
4. **Manual:** 「幫我新增三份豬肉到庫存」 → Approve banner → Approve → Kitchen Inventory shows pork.

## Confirmation that root cause is fixed

Mutating chat requests cannot finish with invented “已加入庫存” text without a tool path; either HITL/write runs or the user is told nothing was saved.
