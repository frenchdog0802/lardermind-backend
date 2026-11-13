# Feature: Pre-launch entitlement messaging

**Status:** Implemented  
**Scope:** Align guest/Pro limits and marketing/app copy before Stripe live; surface 7-day trial on Free plan + quota upsell; remove recipe-import claims until import UI ships.  
**Out of scope:** Recipe URL import UI; AI/recipe usage counter accuracy; setup-guide overlay; should-fix QA from issue #2; mobile App Store copy.

**Issue:** [lardermind-backend#2](https://github.com/frenchdog0802/lardermind-backend/issues/2)  
**Design:** [pre-launch-entitlement-messaging-design.md](../design/pre-launch-entitlement-messaging-design.md)  
**Tasks:** [tasks/pre-launch-entitlement-messaging/](../../tasks/pre-launch-entitlement-messaging/)

---

## 1. Summary

QA on lardermind.com found mismatched limits (guest dies at ~5 while copy implies Free’s 20), Pro advertised at 200 msgs/day with a desire to lower to 150 for margin, trial only visible on Stripe Checkout, and recipe URL/social import advertised with no UI.

### Locked decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Guest limit vs copy | Keep `GUEST_TIER.aiMessagesPerDay = 5`; change page/demo copy to **5/day** |
| — | Pro AI/day | `PRO_TIER.aiMessagesPerDay` **200 → 150**; update all copy together |
| 16 | Trial visibility | Show **7-day Pro trial** on Free plan screen and quota-hit upsell; trial still starts at Stripe checkout |
| 19 | Recipe import | **Remove** import claims for launch; build import screen later |

---

## 2. Requirements

### 2.1 Limits (backend source of truth)

1. Guest AI messages/day remains **5**.
2. Free AI messages/day remains **20**.
3. Pro AI messages/day becomes **150**.
4. `/api/subscription/plans` continues to expose `free` / `pro` from entitlement constants.

### 2.2 Marketing / pricing copy

1. Live try / guest demo states **5 messages/day** (not Free’s 20).
2. Pricing + fallbacks show Pro **150** messages/day.
3. Trial line: trial starts when upgrading (e.g. “Start a 7-day Pro trial when you upgrade”) — **not** “New accounts get N days of Pro”.
4. Remove URL / YouTube / Instagram / social import rows and bullets from landing FAQ, demo bullets, PricingSection, SubscriptionPanel usage + upgrade blurb.

### 2.3 In-app Free plan + upsell

1. Free plan (`SubscriptionPanel` when `!isPro`): clear line that upgrading includes a **7-day Pro trial**.
2. Upgrade card leads with trial + Pro limits (150 AI/day; no import claim).
3. Quota-exceeded chat UI (guest signup / Free upgrade) offers the same trial CTA (implemented with must-fix #2).

---

## 3. Edge cases

- Plans API failure: frontend FALLBACK_PLANS must match entitlement (Pro 150, no import rows).
- Existing Pro subscribers: limit drops to 150 on next day period; no migration.
- Backend may still return `recipeImports*` fields; UI hides them.

---

## 4. Acceptance

- [x] Guest demo copy says 5/day; enforcement stays 5.
- [x] Pro tier + pricing/subscription copy say 150/day.
- [x] No public claim of recipe URL/social import.
- [x] Free plan + upgrade surfaces 7-day trial; pricing no longer says new accounts auto-get Pro.
