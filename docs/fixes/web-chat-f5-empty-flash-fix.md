# Fix Design: Web chat F5 empty-state flash

**Bug:** `docs/bugs/web-chat-f5-empty-flash.md`  
**RCA:** `docs/rca/web-chat-f5-empty-flash-rca.md`  

---

## Fix Approach

1. Add `isBootstrapping` state, initial `true`.
2. Mount `bootstrap()` sets it `false` in a `finally` block after sessions + history attempt (success or failure).
3. Main body gate order: recipe → **bootstrapping → `Loading compact`** → empty → messages.
4. Header: while bootstrapping, use `nav.aiChat` (not `nav.newChat`).
5. Extract a tiny pure helper `resolveChatBodyMode` / header “new chat” decision for fail-first unit tests.

Do not change API contracts, keep-alive, or session-switch loading (out of scope; switch keeps prior messages until history returns).

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| Hide entire Chat shell until loaded | Heavier; composer/header flash differently |
| Cache last messages in `sessionStorage` | Extra complexity; still need network for truth |
| Parallelize sessions+history only | Helps latency but does not remove first-paint empty flash |
| Skeleton mimicking bubbles | Nice-to-have; `Loading compact` is enough |

## Scope of Change

- `frontend/src/utils/chatBootstrapGate.ts` (+ `.test.ts`) — pure mode helpers
- `frontend/src/components/AICookingAssistant.tsx` — state, bootstrap `finally`, render/header gates
- Docs: mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Revert helper + `AICookingAssistant` changes. Flash returns.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| True empty chat never shows empty state | Only hide empty while `isBootstrapping`; clear flag in `finally` |
| Bootstrap hang leaves perpetual spinner | Existing try/catch paths still end; `finally` always clears |
| Session switch flash | Unchanged; not in scope |

## Regression Test Plan

1. **Unit:** `resolveChatBodyMode` / header new-chat helper — bootstrapping→loading; after load empty→empty; with messages→messages.
2. **Manual:** F5 with history → loading then messages, no empty flash; new empty session after load → `ChatEmptyState`.

## Confirmation that root cause is fixed

First paint with history no longer renders `ChatEmptyState`; empty state only after bootstrap completes with zero messages.
