# Task 01: Auto-title module (sanitize, fallback, maybe)

**Phase:** 1 — Backend core  
**Depends on:** none

## Goal

Add `backend-cf/src/agent/auto-title.ts` with pure helpers and `maybeAutoTitleSession` orchestration (may stub DB/LLM wiring until task 02 if cleaner — prefer full function with injected deps or real imports once 02 lands; this task owns helpers + prompt + orchestration shape).

## Work

1. Export `DEFAULT_CHAT_TITLE`, max char constants.
2. Implement `sanitizeTitle`, `fallbackTitleFromMessage`.
3. Implement title system/user prompt builder.
4. Implement `maybeAutoTitleSession` per design (skip non-sentinel; LLM then fallback; conditional persist).
5. Unit tests for sanitize/fallback (fail-first OK).

## Acceptance

- [ ] Helpers reject empty / enforce max length
- [ ] Sentinel skip path covered by test (mock)
- [ ] No product route wiring yet required in this task (can be internal-ready)

## Notes

If conditional DB helper is not yet landed, keep persist call behind a small local helper and replace in task 02 — or do 01+02 together if faster; checklist still marks both.
