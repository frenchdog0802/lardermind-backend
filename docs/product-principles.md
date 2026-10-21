# LarderMind product principles

**Status:** Active  
**Audience:** Product decisions, feature scope, UX copy, agent behavior  
**Last updated:** 2026-10-19

These principles decide *what we ship* and *in what order*. Feature docs and designs should cite them when trade-offs appear. They do not replace the [dev workflow](./workflow/README.md).

---

## North star

> You can't force people to involve you in decision-making.  
> You have to provide value to them first.

> After people either benefit from what you provided, or see the potential benefits that they could get from you, then you'll get a seat at the table.

**LarderMind earns the meal-planning seat by first making “what can I cook / what do I need?” obviously useful.** Calendar, inventory discipline, and closed-loop automation come after that benefit is felt—not before.

### First interaction rule (non-negotiable)

**第一次互動就要讓人覺得「有用」，而不是「先填完資料再說」。**

The first meaningful session must deliver a felt win (e.g. cookable suggestions, a shortage list, a fixable next step)—not a homework list (complete pantry, finish profile, tour five hubs, subscribe). Incomplete data is normal; blocking on completeness is a product failure.

| First interaction | Later (earned) |
|-------------------|----------------|
| Sparse input → useful outcome | Full pantry accuracy |
| “You can cook these / need these” | Soft-reserve calendar discipline |
| Optional next step | Habitual closed-loop use |

---

## Principles

### 1. Value before commitment

Ship a clear benefit with minimal setup. Do not require a complete pantry, full recipe library, subscription, or five-hub fluency before the user gets a useful answer. **If the first interaction feels like data entry, the design failed this principle.**

| Do | Don't |
|----|--------|
| Answer from sparse input (photo, a few items, one question) | Gate the first win behind long onboarding forms |
| Show outcome first (cookable meals, shortages, next action) | Lead with account, plan, or “complete your profile” |
| Soften friction that blocks the first win (e.g. basic seasonings, define-unit) | Force perfect data before any suggestion |
| Treat empty / partial pantry as a valid starting state | Require “finish setup” before Chat can help |

### 2. Earn the seat at the table

Deeper product surfaces (calendar soft-reserve, shopping merge, cook confirm, preferences) are *earned* after the user benefits—or clearly sees they could.

| Do | Don't |
|----|--------|
| Offer the next loop step when it reduces work they already care about | Push schedule / deduct / sync as the first job |
| Make closed-loop feel like help, not homework | Treat “use all five hubs” as success by itself |
| Let users stay in chat-only or light pantry use | Shame incomplete setups |

### 3. One concrete win per interaction

Each primary flow should deliver one understandable outcome the user can act on now.

| Do | Don't |
|----|--------|
| “These you can cook; these need X; tap to fix units” | Walls of tools, status, and hubs with no single takeaway |
| Prefer actionable cards over essay replies | Dump inventory dumps or theory when a next step exists |
| End with one clear optional next step | Stack multiple unrelated CTAs in the first viewport of a flow |

### 4. Honest usefulness over clever automation

Silent wrong answers destroy trust faster than asking once. Prefer clarify / confirm when the system is unsure (units, missing staples, schedule writes).

| Do | Don't |
|----|--------|
| HITL / confirm for mutating pantry or plans | Silent convert, silent deduct, silent “you can cook this” when data is wrong |
| Say what is assumed (e.g. basic seasonings ON) | Hide assumptions that change cookability |
| Fail closed and explain | Fake success cards or empty “helpful” chrome |

### 5. The kitchen loop is the product—not five apps

Chat, Calendar, Pantry, Shopping, and Recipes are one system. New work should strengthen the loop or the first win inside it—not add a disconnected surface.

Canonical loop (see [kitchen-closed-loop](./features/kitchen-closed-loop.md)):

**Pantry → Recipes → Calendar (soft reserve) → Cook confirm (deduct) → Shopping fills gaps → Chat orchestrates.**

| Do | Don't |
|----|--------|
| Design features that feed the next hub with less typing | Build a hub feature that never reconnects to cook / buy / plan |
| Keep Chat as the orchestrator for ambiguous intent | Force users to learn five UIs before any meal help |

---

## Decision tests

Use these when scoping a feature, cutting scope, or resolving a design debate. Prefer “yes” answers.

1. **First-win test** — Does the first interaction feel useful, or does it feel like “fill in the data first”? If the latter, redesign.
2. **Seat test** — Are we asking for calendar / inventory / payment / habit change *before* they’ve felt or clearly previewed benefit?
3. **Outcome test** — Does the primary screen or card answer one question they already have (cook / buy / plan)?
4. **Trust test** — If we’re wrong, do we ask or confirm instead of silently mutating state?
5. **Loop test** — Does this make the closed kitchen loop tighter, or only decorate one hub?

If a proposal fails tests 1–2, redesign for value-first. If it fails 4, it is not ready to ship.

---

## Implications (how we work)

| Area | Implication |
|------|-------------|
| Onboarding / empty states | First screen/session = try-it value (suggest, photo, paste list). Never “complete your data, then we’ll help.” |
| Chat & agents | Tools and cards must produce a usable outcome; empty or status-only chrome is a defect |
| Monetization | Paywall after demonstrated value (or a clear preview of Pro benefit)—not before first win |
| Feature priority | Prefer unblocking “can cook / need to buy” over polish on secondary hubs |
| Docs | New feature specs should note which principles they serve and any trade-off |

**Examples already aligned:** [flexible-cookable-suggestions](./features/flexible-cookable-suggestions.md) (first-win softening), [kitchen-closed-loop](./features/kitchen-closed-loop.md) (earned deeper loop), HITL on pantry/plan writes (trust). **Closing first-win gap:** [empty-state-value-first](./features/empty-state-value-first.md) (knowledge/generic-plan answers before paste homework).

---

## Anti-patterns

- First session that is mostly forms, tours, or “please add pantry items first”  
- Requiring full pantry accuracy before any meal suggestion  
- Treating “open Calendar / Shopping / Recipes” as the goal of Chat  
- Silent unit conversion or silent stock mutation  
- Onboarding that explains the product before showing benefit  
- Shipping a new surface that cannot feed cook, buy, or plan  

---

## Change control

Amend this file when product direction changes. Do not fork competing principle docs. Feature-level locked decisions stay in their feature/design docs; they should not contradict these principles without an explicit, documented exception here.
