# Task 03: Stream path — auto-title + SSE `session_title`

**Phase:** 2 — Wire chat  
**Depends on:** 01, 02

## Goal

After an accepted stream turn (`complete` or `interrupt`), auto-title when sentinel and notify the client.

## Work

1. In `stream-chat.ts` (or thin helper used by it), call `maybeAutoTitleSession` with the user message after `runAgentTurn` returns `complete`/`interrupt`.
2. If a title is returned, `writeEvent('session_title', JSON.stringify({ sessionId, title }))`.
3. Prefer emit before token loop / before interrupt payload finalization per design; keep `done` last on complete.
4. Ensure title failures never block emitting the assistant result.
5. Test: mocked turn + mocked maybeAutoTitle → SSE includes `session_title`.

## Acceptance

- [ ] Complete turn with default title emits `session_title`
- [ ] Busy/quota/error do not emit title
- [ ] Stream still completes if title throws (guarded try/catch)
