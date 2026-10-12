# RCA: Chat wrong “today” date and false prior-tool-failure claim

**Bug:** `docs/bugs/chat-wrong-today-date.md`  
**Status:** Confirmed via code inspection + product screenshots  

---

## Root Cause

### A. Wrong “today” for meal plans (calendar empty)

`runAgentTurn` always injects a **static** system prompt (`COOKING_ASSISTANT_SYSTEM_PROMPT`) with **no calendar date and no timezone**.

`addRecipeToMenu` requires `serving_date` (`YYYY-MM-DD`) from the model. When the user says 「今天」, the model invents a date (observed: `2025-06-05`) from training/context. After HITL approve, D1 correctly stores that invented date — Calendar for the user’s real today correctly shows nothing.

### B. False claim that a prior shopping-list add failed

Tool results and UI cards are ground truth for writes. Chat history for the model is mainly **assistant/user text**, not a reliable structured “which tools succeeded” ledger. The system prompt forbids claiming a write succeeded **in this turn** without a tool call, but does **not** forbid inventing failure / “I didn’t call tools” about **prior** turns. The model over-corrected and contradicted a visible `shopping_list_updated` (or equivalent) success card.

## Contributing Factors

1. No `clientLocalDate` / timezone on `/api/chat/stream` | `/send` (or resume).
2. Tool description for `serving_date` is only `YYYY-MM-DD` with no “use today’s date from system context”.
3. Prior mutating-intent / anti-hallucination work focused on **false success** in the current turn, not false failure about history.
4. Mixed HITL batches can show read tools (e.g. `listMyRecipes`) next to writes, which may confuse users/models about what ran — secondary UX issue, not the date root cause.

## Affected Components

| Component | Role |
|-----------|------|
| `backend-cf/src/agent/system-prompt.ts` | Static prompt; no today |
| `backend-cf/src/agent/agent-loop.ts` | Assembles system + history for LLM |
| `backend-cf/src/routes/chat.ts` / `stream-chat.ts` | Request body has no local date |
| `frontend/src/api/chat.ts` / `mobile/src/api/chat.ts` | Do not send client local date |
| `addRecipeToMenu` executor | Trusts model `serving_date` as-is |

## Data / State Impact

- Meal plan rows may exist on wrong `serving_date` (e.g. `2025-06-05`).
- Shopping list / other writes can be correct while assistant text claims they failed (history pollution / trust).
- No corruption of successful card-backed writes; mis-scheduling is the data issue.

## Timeline

Introduced with CF chat tools + meal-plan tools: model-owned `serving_date` without injecting “today”. Anti-false-success prompt later increased the chance of false “I didn’t call tools” apologies about earlier turns.

## Why it wasn't caught earlier

- Happy-path tests pass fixed `serving_date` strings into tools; they do not assert “今天” → real local date.
- Manual tests that happen to match the model’s guessed date look fine.
- False prior-failure copy is intermittent and easy to dismiss when the card already succeeded.

## Plausible alternatives (ranked)

1. **Confirmed (A):** No today in prompt → model invents `serving_date` → Calendar today empty.
2. **Confirmed (B):** Prompt/history allow inventing prior tool failure; card proves write ran.
3. Less likely for empty Calendar: user never Approved — possible in some sessions, but screenshot also shows post-approval success copy for `2025-06-05`, which still would not appear on real today.
4. Unlikely: Calendar UI cache only — wrong date in HITL summary is independent of client cache.
