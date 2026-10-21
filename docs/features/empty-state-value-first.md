# Feature: Empty-state value-first replies

**Status:** Implemented (Phases A–B)  
**Scope:** When pantry/recipes are empty or sparse, answer **knowledge / principle / generic-plan** questions with a complete usable answer first, then optionally invite the user to paste kitchen data for personalization. Keep paste-list first-win for **stock-dependent** intents. Improve guest “save kitchen” copy so the benefit is clear.  
**Out of scope (v1):** Becoming a baby-food (or any vertical) specialist product; inventing pantry stock or recipes into D1 without HITL; sample kitchen / starter pack as primary path; new classifier service or router model; redesign of Chat empty chrome beyond light copy; medical diagnosis / personalized clinical advice.

**Design:** [empty-state-value-first-design.md](../design/empty-state-value-first-design.md)  
**Tasks:** [tasks/empty-state-value-first/](../../tasks/empty-state-value-first/)

**Principle:** [product-principles.md](../product-principles.md) — First interaction rule; Value before commitment; One concrete win.

**Depends on (shipped):** [first-win-bootstrap](./first-win-bootstrap.md) (paste-list path + guest trial) — this feature **narrows** when paste-list is the lead response, without retiring that path.

**Related UX pain:** Empty kitchen + 「規劃第一天副食品」→ agent refuses because pantry is empty, buries general complementary-feeding principles under “reminders,” and asks the user to paste a grocery list before giving any usable plan.

---

## 1. Summary

`first-win-bootstrap` correctly unblocked “cook from what I have” by steering empty kitchens to **paste a fridge/shopping list**. The agent contract over-applied that path: **any** planning-sounding ask with empty pantry became “I can’t help until you give data,” even when the question is answerable with domain knowledge alone.

This epic delivers:

| Layer | Product outcome |
|-------|-----------------|
| **A — Intent split in agent contract** | Knowledge / principle / generic-plan asks get a **full answer first**; stock-dependent asks still paste-list. Never invent pantry without HITL. |
| **B — Guest save copy** | Banner / save CTA states **what saving keeps** (pantry, recipes, chat), not only “Trying as guest.” |

### Why now

- Product principles already forbid “fill data first”; live guest/mobile replies violate First-win and Outcome tests for non-stock questions.
- Paste-list remains the right path for “冰箱有什麼能煮” — we must not throw that away; we must **scope** it.

---

## 2. Phases

| Phase | Name | Status | Ships product change? |
|-------|------|--------|------------------------|
| **A** | Value-first empty reply contract (prompt + tests) | **Done** | Yes (agent behavior) |
| **B** | Guest save benefit copy (Mobile + Web guest) | **Done** | Yes (i18n / banner) |

Ship A first; B may land in parallel after A’s locked reply shape is clear.

---

## 3. Requirements — Phase A (intent split)

### 3.1 Intent classes (v1, prompt-level)

| Class | Examples | Empty / sparse pantry behavior |
|-------|----------|--------------------------------|
| **Knowledge / principle / generic plan** | 「規劃第一天副食品」、十倍粥怎麼煮、過敏觀察幾天、素食一週菜單概念（不要求對齊庫存） | Lead with a **complete, actionable answer** (steps, portions, schedule, or principles the user can use today). Then **one** optional invite: tell me what’s in your kitchen and I’ll adjust / save to pantry. |
| **Stock-dependent cook / plan** | 「用現有食材煮什麼」、冰箱能煮什麼、依庫存排 7 天、缺什麼去買 | Honest empty state + **paste short fridge/shopping list** (existing first-win path). Do not invent stock. |
| **Ambiguous** | 「幫我規劃晚餐」 with no stock cue | Prefer a **short generic starter plan** (or 1–2 concrete options) + ask whether to personalize from pantry / paste list — do **not** lead with refusal. |

### 3.2 Reply shape (knowledge / generic plan)

1. **Answer first** — usable plan or principles in the body (not a footnote).  
2. **Assumptions explicit** — e.g. “assuming typical first-foods start; not medical advice.” One short line max.  
3. **One next step** — invite paste list / pantry personalization **or** offer to create recipes after they confirm ingredients — not a three-step “I will do X/Y/Z” essay with no answer.  
4. **No false writes** — do not claim pantry/recipes were updated unless tools + HITL ran.

### 3.3 Hard constraints (unchanged)

- Do not invent pantry items or persist recipes without HITL.  
- Do not skip HITL on mutators.  
- Paste-list orchestration (`addPantryItems` → `createRecipe` → `suggestMealsFromPantry`) remains for stock-dependent / pasted lists.  
- Prefer concision unless the user asks for detail (existing prompt rule).

### 3.4 Success criteria (Phase A)

- [x] System prompt documents intent split + value-first reply shape.  
- [x] Vitest prompt-contract asserts: knowledge/generic-plan must answer first; paste-list reserved for stock-dependent / empty cook-from-pantry; still forbid inventing stock.  
- [ ] Manual smoke: empty guest/auth chat — 「規劃第一天副食品」 yields a usable day-1 plan in the **main** reply, with paste invite secondary (not a refusal lead).  
- [ ] Manual smoke: empty chat — 「冰箱有什麼能煮」 still asks to paste a list (no invented stock).

---

## 4. Requirements — Phase B (guest save copy)

### 4.1 Copy goal

Guest chrome must answer: **what do I keep if I save?** — pantry items, recipes, and this chat/kitchen progress — not only “trying as guest.”

### 4.2 Surfaces

- Mobile guest banner + CTA (`auth.guestBanner` / `guestBannerCta`).  
- Web landing guest footer / save prompt (`landing.guestFooter`, `guestSavePrompt`, `guestSaveCta`) for parity of benefit language.

### 4.3 Success criteria (Phase B)

- [x] en + zh copy states persistence benefit (pantry / recipes / kitchen), not status-only.  
- [x] Banner still one line + one CTA (no multi-CTA clutter).  
- [x] First-win paste path unchanged by copy-only change.

---

## 5. Epic acceptance

1. Empty kitchen + knowledge/generic-plan ask → complete usable answer first; paste/personalize is optional follow-up.  
2. Empty kitchen + stock-dependent cook ask → paste-list path; no invented stock.  
3. Ambiguous plan ask → short generic value + clarify; no refusal-first.  
4. Guest save chrome explains what saving keeps (Web + Mobile).  
5. Product principles First-win + Outcome tests pass for the baby-food-style repro and for “cook from pantry” empty.

---

## 6. Edge cases

- User asks knowledge question **and** pastes a list in the same message → answer knowledge briefly if needed, then run paste orchestration (tools + HITL).  
- User rejects personalization invite → stop asking; do not nag.  
- Safety-sensitive topics (infant feeding, allergies): general public guidance + short “not a substitute for clinician advice”; still give the usable default plan.  
- Guest quota exhausted mid-answer → existing quota UX; do not invent tool results.  
- Non-food paste → existing refuse non-food rule.

---

## 7. Locked decisions

| Decision | Choice |
|----------|--------|
| Mechanism (v1) | Prompt + contract tests only (no new intent API) |
| Paste-list path | Keep for stock-dependent / empty cook-from-pantry |
| Inventing stock | Never without HITL |
| Vertical product | Stay general cooking assistant; deepen rule-heavy answers, don’t rebrand |
| Guest banner | Benefit copy in same epic (Phase B) |
| Empty Chat CTAs | Keep paste-first as primary empty CTA; agent behavior is the main fix |
