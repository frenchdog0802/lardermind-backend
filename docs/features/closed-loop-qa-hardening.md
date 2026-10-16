# Feature: Closed-loop QA hardening

**Status:** Implemented (Phases 0–7; Maestro live-chat HITL deferred to manual checklist)  
**Scope:** Harden Kitchen closed-loop quality with phased **product decision locks**, **deterministic state tests**, **prompt-contract / eval coverage**, and a small **E2E** set — without reopening kitchen-closed-loop Phases 1–5 as greenfield work.  
**Out of scope:** Google/Apple calendar sync; Stripe; mobile visual redesign; LangGraph; persisted `reserved_qty`; full shopping provenance UI (unless Phase 4 ships a minimal tag).

**Design:** [closed-loop-qa-hardening-design.md](../design/closed-loop-qa-hardening-design.md)  
**Tasks:** [tasks/closed-loop-qa-hardening/](../../tasks/closed-loop-qa-hardening/)

**Depends on (shipped):** [kitchen-closed-loop](./kitchen-closed-loop.md), [web-calendar-hub](./web-calendar-hub.md), [chat-meal-plan-to-calendar](./chat-meal-plan-to-calendar.md)

**Related bug (Resolved, regression anchor):** [chat-shortage-union-misattribute](../bugs/chat-shortage-union-misattribute.md)

---

## 1. Summary

AI chat + pantry / calendar / shopping still have **undefined product oracles** and **coverage gaps**. Manual chat scripts alone cannot gate soft-reserve math, shopping merge, or cancel→list rollback.

This feature splits remaining work into phases: lock decisions → Vitest state suites → prompt contracts / eval → optional product fixes → Maestro E2E.

### Why now

- Multi-meal shortage misattribution shipped a prompt+schema fix but still lacks a golden chat / tool-json regression at the narrative layer.
- Cancel releases soft-reserve by design but has no dedicated integration test.
- Shopping add from chat vs Calendar UI disagree (INSERT vs skip).
- Unit mismatch (包 vs g), same-slot conflict, cancel→shopping rollback, and allergy retention across turns have no pass/fail contract.

---

## 2. Phases (backlog → ship)

| Phase | Name | Status | Ships product change? |
|-------|------|--------|------------------------|
| **0** | Lock six product decisions | **Done** (user: 全用建議) | Doc only |
| **1** | Soft-reserve lifecycle Vitest (plan → reserve → cancel → restore; confirm deduct) | Done | No (tests only) |
| **2** | Multi-meal shortage attribution regression (labels + golden tool JSON / prompt) | Done | No (tests) |
| **3** | Shopping duplicate policy (unify merge per decision #2) | Done | Yes |
| **4** | Cancel meal → shopping policy (v1 leave) | Done | Doc + test |
| **5** | Prompt contracts: allergy retention + fuzz refusals + planMeals cap narrative | Done | Prompt |
| **6** | Unit mismatch clarify-or-refuse + confirm qty≤0 delete | Done | Yes |
| **7** | E2E: manual checklist (Maestro chat deferred) | Done | Checklist |

---

## 3. Phase 0 — Decisions to lock (before product code)

| # | Decision | Locked choice |
|---|----------|---------------|
| 1 | Same `serving_date` + `meal_type` | **Allow duplicates** + chat **warn**; replace tool later |
| 2 | Shopping duplicate names | **Server merge** qty by name+unit (CI); agent + Calendar unified |
| 3 | Cancel/delete meal → shopping lines | **v1 leave** shopping unchanged; v2 provenance deferred |
| 4 | Unit mismatch (包 vs g) | **Clarify or refuse** — no silent cross-unit subtract |
| 5 | Confirm deduct to qty 0 | **Delete** pantry row when ≤0 (align with chat update) |
| 6 | Allergy / 吃素 retention | **Must** `getPreferences` before `planMeals` / cookable suggest |

Locked: 2026-10-15 (user: 全用建議).

---

## 4. Success criteria (epic)

- [x] Phase 0 decisions recorded in design + feature (checked boxes with chosen option)
- [x] Phase 1: Vitest proves soft-reserve release on cancel and confirm deduct
- [x] Phase 2: Vitest (+ optional golden) proves per-meal shortage labels; no A-under-B
- [x] Phase 3: One shopping merge policy in agent + Calendar path
- [x] Phase 4: Documented cancel→shopping policy; v2 only if tagged
- [x] Phase 5: Prompt/unit tests for allergy call + fuzz refusals
- [x] Phase 6: Unit mismatch path implemented or explicitly deferred with ticket
- [x] Phase 7: Manual closed-loop checklist (Maestro chat HITL deferred)

---

## 5. Edge cases

| Case | Expected (after locks) |
|------|------------------------|
| Two dinners same day | Warn in chat; both may exist in v1 |
| Add garlic twice from chat | One row, qty stacked (if #2 merge) |
| Cancel Friday soup after shopping | Soft-reserve restored; shopping unchanged in v1 |
| 10包 vs 500g | No silent wrong deduct; ask or refuse |
| 「新增 iPhone 到庫存」 | Refuse non-food (prompt/guard) |
| Empty pantry 「用現有食材做一頓」 | Honest short / shop offer; no fake stock |

---

## 6. Non-goals

- Replacing kitchen-closed-loop soft-reserve engine
- Full LLM eval farm / LangSmith production
- Mobile Inventory available badges
- Auto-rollback shopping in v1 without provenance

---

## 7. References

- QA canvas (session): closed-loop AI×state strategy  
- Design: [closed-loop-qa-hardening-design.md](../design/closed-loop-qa-hardening-design.md)  
- Parent epic: [kitchen-closed-loop.md](./kitchen-closed-loop.md)
