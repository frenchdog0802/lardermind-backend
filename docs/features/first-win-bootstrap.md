# Feature: First-win bootstrap

**Status:** Implemented (Phases A–E)  
**Scope:** Make the first interaction feel useful (paste list → pantry HITL → recipe HITL → cookable suggestions) across **Web**, **Mobile**, and **Guest real-AI trial**. Retire Setup Guide homework; force signup only to save data or enter the closed loop.  
**Out of scope (v1):** Sample kitchen / starter pack as primary path; Web Chat photo attach / pantry-vision parity; Turnstile; soft Google-only wall instead of guest; rebuilding closed-loop or flexible-cookable internals beyond prompt/orchestration; keeping Setup Guide as sequential locked homework.

**Design:** [first-win-bootstrap-design.md](../design/first-win-bootstrap-design.md)  
**Tasks:** [tasks/first-win-bootstrap/](../../tasks/first-win-bootstrap/)

**Principle:** [product-principles.md](../product-principles.md) — First interaction rule.

**Supersedes:** [web-setup-guide](./web-setup-guide.md) floating panel (retired from product).

---

## 1. Summary

Today a new user hits auth → empty Chat → Setup Guide locking Chat behind pantry/recipes → “Cook with what I have” dead-ends with empty pantry/recipes. Landing uses a **scripted** DemoChatBox that does not match post-signup reality.

This epic delivers:

| Layer | Product outcome |
|-------|-----------------|
| **A — Stop homework** | Retire Setup Guide; Chat empty leads with paste/value CTAs (Web + Mobile) |
| **B — Paste-list first win** | Chat paste → `addPantryItems` HITL → `createRecipe` HITL → `suggestMealsFromPantry` card |
| **C — Guest backend** | Short-lived guest JWT, ephemeral D1 data, strict quota + IP limits, tool allowlist, claim-on-signup |
| **D — Web guest UX** | Landing real guest Chat replaces scripted demo |
| **E — Mobile guest UX** | “Try without account” → same paste path |

### Locked decisions

| Decision | Choice |
|----------|--------|
| Surfaces | Web + Mobile + Guest real AI |
| First-win paths | Paste list + retire Setup Guide / Chat-empty leads |
| Guest model | Real AI; ephemeral data; signup to save or enter closed-loop |
| Setup Guide | Hide / retire; guidance in Chat empty |
| Post-paste outcome | Agent `createRecipe` (HITL) then cookable suggestions |
| Abuse | Anonymous short-lived token + daily quota + IP rate limit + TTL cleanup (no Turnstile v1) |

---

## 2. Phases

| Phase | Name | Status | Ships product change? |
|-------|------|--------|------------------------|
| **A** | Retire Setup Guide + Chat empty outcome-first | Done | Yes |
| **B** | Paste-list agent contract + CTAs | Done | Yes |
| **C** | Guest JWT, quotas, IP limits, TTL, allowlist, claim | Done | Yes |
| **D** | Web landing guest Chat | Done | Yes |
| **E** | Mobile try-without-account + empty parity | Done | Yes |

Ship A → B → C → D/E (D and E after C).

---

## 3. Requirements — Phase A

1. Web desktop no longer mounts the locking Setup Guide panel for authenticated users.
2. Quietly clear or ignore legacy `lardermind.setupGuide.*` localStorage.
3. Chat empty (Web + Mobile): wire `ai.emptyHint`; primary CTA = paste fridge/shopping list; demote hub-nav chips and “Add items to pantry” as peer first actions.
4. Hub empties (Pantry / Shopping / Recipes): one escape hatch to Chat with paste intent — not a full hub redesign.

### Success criteria (A)

- [x] Authenticated Web user never sees locking Setup Guide.
- [x] Empty Chat leads with paste/value copy on Web and Mobile.
- [x] First-win test: first screen does not feel like “fill data first.”

---

## 4. Requirements — Phase B

Happy path (authenticated):

1. User pastes a fridge/shopping list in Chat.
2. Agent calls `addPantryItems` → user Approve (HITL).
3. Agent calls `createRecipe` (1+ recipes matching items) → user Approve (HITL).
4. Agent calls `suggestMealsFromPantry` → non-empty `meal_suggestions` card when recipes overlap pantry.

Rules:

- Do not invent pantry stock without HITL.
- Do not skip HITL on mutators.
- Chat is the paste surface (no dedicated paste modal).
- Empty-state prompts model the path in en/zh (Web + Mobile).

### Success criteria (B)

- [x] Prompt/system contract documents paste → create → suggest order.
- [x] Vitest/prompt-contract coverage for sparse/empty orchestration.
- [ ] Manual smoke: paste list → two HITLs → suggestions card.

---

## 5. Requirements — Phase C (Guest backend)

| Concern | Requirement |
|---------|-------------|
| Mint | `POST /api/auth/guest` → short-lived JWT with `guest: true` |
| Storage | Guest rows in D1 under guest `user_id` with `expires_at` |
| Allowlist | `addPantryItems`, `createRecipe`, `suggestMealsFromPantry` (+ needed list/read helpers) |
| Blocked | Calendar plan confirm, shopping closed-loop mutators, durable prefs writes → `403` signup_required |
| Quota | Stricter than free (e.g. few AI msgs per guest day) |
| Abuse | Per-IP rate limit on guest mint + chat |
| Cleanup | TTL purge (cron and/or lazy) |
| Claim | On signup/login, claim guest pantry/recipes/chat into real user **or** discard |

### Success criteria (C)

- [x] Guest can complete Phase B path via API without a real account.
- [x] Blocked tools return clear signup gate.
- [x] Quota + IP limits enforced; expired guest data purged.
- [x] Claim migrates or discards explicitly.

---

## 6. Requirements — Phase D (Web guest UX)

1. Landing replaces scripted `DemoChatBox` primary path with guest Chat shell (mint → stream → HITL cards).
2. After first useful suggestions card: “Save my kitchen” → signup/login → claim.
3. Guest cannot open full five-hub app until authenticated.

### Success criteria (D)

- [x] Landing try path uses real AI for paste → suggest.
- [x] Scripted demo demoted or removed as primary.
- [x] Claim after signup preserves guest kitchen when user opts in.

---

## 7. Requirements — Phase E (Mobile guest UX)

1. Auth stack: “Try without account” → guest mint → Chat-first.
2. Same signup wall for blocked tools / save.
3. Empty state aligned with Phase A/B (hint + paste CTA).

### Success criteria (E)

- [x] Mobile guest can complete paste → suggest without signup.
- [x] Empty/first-win copy aligned with Web paste-first principle.

---

## 8. Epic acceptance

1. New authenticated Web user never sees locking Setup Guide; Chat empty leads with paste/value CTAs.
2. Paste list → approve pantry → approve recipe(s) → non-empty meal suggestions (happy path).
3. Guest (Web + Mobile) can complete that path with real AI without signup.
4. Guest hitting plan/shop/save gets clear signup gate; after signup, claim or discard.
5. Guest mint + chat limited by quota and IP; expired data purged.
6. Mobile and Web empty copy aligned on paste-first.
7. Product principles First-win test passes for empty pantry new/guest users.

---

## 9. Edge cases

- Empty paste / non-food items → refuse non-food; ask for a usable list.
- User rejects pantry HITL → do not create recipes from invented stock.
- Guest token expired mid-session → re-mint or prompt signup; fail closed on claim.
- Guest already claimed → second claim fails closed.
- Mid-Setup-Guide users → panel gone; no migration required.
