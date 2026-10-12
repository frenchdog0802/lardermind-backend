# Fix Design: Chat wrong “today” date and false prior-tool-failure claim

**Bug:** `docs/bugs/chat-wrong-today-date.md`  
**RCA:** `docs/rca/chat-wrong-today-date-rca.md`  

---

## Fix Approach

Smallest fix that makes “今天” deterministic and reduces false prior-failure copy:

1. **Build a dated system prompt**  
   - Replace static-only usage with `buildCookingAssistantSystemPrompt({ todayLocalDate })` that appends a short, hard rule:  
     `Today's local calendar date is YYYY-MM-DD. When the user says 今天/today (or relative days), use this date (and simple day arithmetic) for meal-plan serving_date. Do not invent another calendar year/date for “today”.`  
   - Also harden: do **not** claim a prior turn failed to call tools or that a write “might not have succeeded” when the conversation already shows a successful tool/card result for that write; if unsure, ask the user to check the relevant screen or offer to re-run — do not invent failure.

2. **Accept optional `clientLocalDate` on chat send/stream**  
   - Body field: `clientLocalDate?: string` validated as `^\d{4}-\d{2}-\d{2}$`.  
   - Pass into `runAgentTurn` / `streamCookingChat` → system prompt.  
   - **Fallback** if missing/invalid: UTC calendar date from `new Date()` (`toISOString().slice(0, 10)`). Document that clients should send local date for correctness near midnight.

3. **Clients send local date**  
   - Web + mobile chat API: on stream/send, include `clientLocalDate` from the device local calendar (`YYYY-MM-DD`).  
   - Resume does not need a new date for already-queued `serving_date` args; no change required unless we later re-plan on resume.

4. **Tool description nudge**  
   - On `addRecipeToMenu` `serving_date`: note that for “today” the model must use the system prompt’s today’s date.

No D1 migration. No change to HITL approve mechanics.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Server UTC only (no client field) | Wrong near midnight for non-UTC users (e.g. Asia/Taipei) |
| Client sends IANA `timeZone` only | Needs timezone library / Temporal in Worker; local date string is simpler and sufficient for meal plans |
| Server rewrites “今天” in tool args | Fragile NLP; prompt + explicit today is enough for v1 |
| Structured tool-result ledger in history | Larger feature; deferred |
| Split read tools out of HITL batch | Real UX issue but separate from this bug |

## Scope of Change

- `backend-cf/src/agent/system-prompt.ts` (+ unit test)
- `backend-cf/src/agent/agent-loop.ts` — accept `clientLocalDate`, build prompt
- `backend-cf/src/agent/stream-chat.ts` — pass field through
- `backend-cf/src/routes/chat.ts` — parse/validate `clientLocalDate` on stream/send
- `backend-cf/src/agent/tools/definitions.ts` — `serving_date` description
- `frontend/src/api/chat.ts` — send `clientLocalDate`
- `mobile/src/api/chat.ts` — send `clientLocalDate`
- Tests: system-prompt builder; agent/route use of client date / fallback
- Docs: mark bug Resolved after implementation

## Data Migration / Backfill

None. Existing wrong-dated meal plans stay; user can re-add for real today or edit Calendar manually.

## Rollback Plan

Revert prompt builder, request field, and client payload changes. Behavior returns to model-guessed “today”.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Spoofed `clientLocalDate` | Authenticated user only; worst case self-schedules wrong day — same as trusting model today |
| Invalid date string | Reject field and fall back to UTC date |
| Extra prompt tokens | One short date block |
| Resume still uses old pending args | Expected; date was chosen at interrupt time |

## Regression Test Plan

1. **Vitest:** `buildCookingAssistantSystemPrompt({ todayLocalDate: '2026-10-11' })` contains that date and today-use rule; also contains anti false-prior-failure wording.
2. **Vitest:** `runAgentTurn` / message assembly uses `clientLocalDate` in system content when provided.
3. **Vitest:** Missing/invalid `clientLocalDate` → system content uses UTC fallback date pattern.
4. **Manual:** Chat 「排到今天」 → HITL summary date equals device local today → Approve → Calendar today shows meal.
5. **Manual:** After a shopping-list success card, later turns should not invent “上一則沒呼叫工具所以蒜頭可能沒成功” without evidence.

## Confirmation that root cause is fixed

“今天” meal plans use the injected local date (or documented UTC fallback), not an invented year; assistant prompt forbids inventing prior tool failure against visible successes.
