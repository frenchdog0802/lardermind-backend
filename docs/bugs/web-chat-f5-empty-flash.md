# Bug: Web chat F5 flash shows empty state before history

**Status:** Resolved  
**Resolved by:** `isBootstrapping` gate + `Loading compact` until history hydrate; helpers in `chatBootstrapGate.ts`  
**RCA:** `docs/rca/web-chat-f5-empty-flash-rca.md`  
**Fix design:** `docs/fixes/web-chat-f5-empty-flash-fix.md`  

---

## Current Behavior

On F5 (full page refresh) while logged in on Chat, the UI briefly shows the empty / “New Chat” initial screen (`ChatEmptyState`), then jumps to the restored message history once APIs return.

## Expected Behavior

After refresh, users with existing history should not see the empty-state welcome. Until history hydration finishes, show a loading placeholder (or equivalent), then either the message list or the true empty state.

## Reproduction Steps

1. Sign in; open Chat; ensure the active session has at least one message.
2. Press F5 (hard refresh).
3. Observe: empty-state / New Chat UI appears first, then messages appear.

## Environment

- App: `frontend/` (Vite / React)
- Screen: `AICookingAssistant`
- Browser: desktop web (any)

## Related Files

- `frontend/src/components/AICookingAssistant.tsx` — `messages` init, mount `bootstrap`, empty-state gate
- `frontend/src/api/chat.ts` — `listSessions`, `getHistory`
- `frontend/src/components/ChatEmptyState.tsx` — empty UI
- `frontend/src/components/Loading.tsx` — existing in-page loader
- `frontend/src/App.tsx` — auth `Loading` only; keep-alive does not survive F5

## Impact Scope

- Cosmetic / UX continuity on web Chat refresh and first mount.
- Does not change history API contracts or mobile RN chat.
- True empty sessions should still show `ChatEmptyState` after load completes.

## Reproducibility Notes

- Code inspection: `messages` starts as `[]`; empty gate is `messages.length === 0` only; history loads in `useEffect` after first paint.
- Flash duration scales with `listSessions` + `getHistory` latency.

## Related Documents

- `tasks/chat-langchain4j-tools/15-web-history-hydration.md` (loading marked optional; not implemented)
- `docs/design/web-agent-chat-ux-design.md`
