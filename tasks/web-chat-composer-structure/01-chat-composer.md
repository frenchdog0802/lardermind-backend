# Task 01: ChatComposer + chrome tests

**Phase:** 1  
**Depends on:** none

## Goal

Add `frontend/src/components/ChatComposer.tsx` with focus-state border ownership and bare textarea isolation. Add fail-first source tests.

## Work

1. Implement `ChatComposer` per design (`forwardRef`, auto-grow, send, focused border).
2. Add `ChatComposer.test.ts` asserting no `focus-within` chrome, focused border state, inline textarea reset.

## Acceptance

- [x] Component exists and matches chrome rules
- [x] Tests fail before wire if asserts are against new file; pass for ChatComposer source once implemented
