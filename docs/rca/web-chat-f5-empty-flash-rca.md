# RCA: Web chat F5 flash shows empty state before history

**Bug:** `docs/bugs/web-chat-f5-empty-flash.md`  
**Status:** Confirmed via code inspection + repro description  

---

## Root Cause

`AICookingAssistant` initializes `messages` to `[]` and renders `ChatEmptyState` whenever `messages.length === 0`. Chat history is fetched only in a mount `useEffect` (`listSessions` then `getHistory` → `setMessages`). There is **no** bootstrapping / history-loading flag in the empty-state gate, so the first paint always treats “not yet loaded” as “empty chat.”

F5 destroys in-memory keep-alive state, so every refresh remounts with empty `messages` and repeats the flash.

## Contributing Factors

1. Empty-state and header title both key off `messages.length === 0` (header shows `nav.newChat` during the flash).
2. Bootstrap is serial (sessions, then history), lengthening the empty window.
3. Task 15 marked loading as optional; no `isBootstrapping` was added.
4. App-level `Loading` only covers auth `initializing`, not chat hydration.

## Affected Components

| Component | Role |
|-----------|------|
| `AICookingAssistant.tsx` | Empty gate + mount bootstrap |
| `ChatEmptyState.tsx` | Shown incorrectly during hydrate |
| `Loading.tsx` | Available but unused for this path |

## Data / State Impact

None. Presentation-only.

## Timeline

Present since web history hydration landed without a loading gate.

## Why it wasn't caught earlier

- Fast local APIs make the flash short.
- Acceptance for task 15 focused on “history appears after refresh,” not “no empty flash.”

## Plausible alternatives (ranked)

1. **Confirmed:** Missing hydrate loading gate + default empty `messages`.
2. Ruled out as primary: Auth redirect to landing — authenticated F5 stays on `aiAssistant` after auth resolves.
3. Ruled out: Accidental `requestNewChat` on refresh — props default false/null.
