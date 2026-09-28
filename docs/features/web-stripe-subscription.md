# Feature: Web Stripe subscription (`backend-cf` + frontend)

**Status:** Implemented on `backend-cf` + web SPA (needs Stripe test/live env to enable checkout)  
**Scope:** Web **Stripe Checkout** + **Customer Portal** + **webhooks** + D1 entitlement on `backend-cf/`; wire real `isPro` into usage gates; SPA upgrade / manage UX  
**Out of scope:** Mobile Play Billing / App Store IAP, Nest/Postgres, Stripe Elements in-app card form, team/org billing, promo codes UI, tax ID collection UI, crypto/ACH, gift subscriptions

---

## 1. Summary

Web subscription UI already expects Checkout (`createCheckout` → redirect) and return query `?subscription=success|cancelled`.  
`backend-cf` only stubs `plans` / `status` with `stripeCheckoutEnabled: false` and hardcodes `isPro: false`. No Stripe secrets, price IDs, webhook, customer mapping, or portal.

This feature makes **Web Pro** purchasable and enforceable via Stripe, while **App Pro remains Google Play Billing** (separate feature).

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | **Web only** | Store policy: App unlock must use Play Billing (`docs/store-launch-todo.md`) |
| Checkout UX | **Stripe-hosted Checkout Session** | Frontend already redirects to `checkoutUrl`; no Elements |
| Manage / cancel / payment method / plan switch | **Stripe Customer Portal** | Covers cancel-at-period-end, update card, monthly↔yearly without custom UI |
| Entitlement source of truth | **D1 `subscriptions` row** updated by **verified webhooks** | Do not trust success URL alone |
| Prices | Env Price IDs: `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` | Operator creates Products/Prices in Stripe Dashboard ($4.99 / $39.99 USD) |
| Trial | **7 days** via Checkout `subscription_data.trial_period_days` **once per user** (no prior paid/trialing row) | Matches existing `trialDays: 7` in plans stub |
| `isPro` statuses | `active`, `trialing`, **`past_due`** (grace) | Keep access during Stripe payment retries |
| Not Pro | `canceled`, `unpaid`, `incomplete`, `incomplete_expired`, `paused`, no row | Clear downgrade |
| One sub per user | Reuse Stripe Customer; if already Pro → **Portal** not second Checkout | Avoid duplicate subscriptions |
| Enable flag | `stripeCheckoutEnabled: true` only when secret + webhook secret + both price IDs set | Safe degrade if misconfigured |
| Admin | `role === 'admin'` → unlimited quotas; no Stripe required | Existing upload pattern |
| AI daily limit | **Enforce** free 20 / Pro 200 per UTC day when charging chat quota | Advertised today but not enforced |
| Image monthly limit | Wire real `isPro` into upload / pantry-vision | Already enforced for free; Pro never applied |
| Recipe count / import caps | **Status reporting only in v1**; hard block deferred | Avoid expanding recipe/import pipeline in same feature |
| Legal | Update Terms + Privacy for Stripe / renewals / cancel | Currently “not disclosed yet” |
| IAP routes | Leave `sync` / `validate-receipt` **unimplemented** (404/501) | Separate mobile billing feature |

### What changes

| Area | Before | After |
|------|--------|-------|
| `GET /api/subscription/plans` | Stub, checkout off | Same catalog; `stripeCheckoutEnabled` reflects config |
| `GET /api/subscription/status` | Always free | Real `isPro` / trial / expiry / plan from D1 |
| `POST /api/subscription/checkout` | Missing | Auth → Checkout Session URL |
| `POST /api/subscription/portal` | Missing | Auth → Customer Portal URL |
| `POST /api/subscription/webhook` | Missing | Verify signature → upsert entitlement |
| D1 | `usage_quotas` only | + `subscriptions` (+ optional event idempotency) |
| Upload / vision / AI | `isPro: false` or no AI cap | Entitlement-aware limits |
| SPA | “not configured yet” | Upgrade + Manage billing buttons |
| Legal | Subs not disclosed | Stripe billing language |

---

## 2. Requirements

### 2.1 Product / UX

1. Logged-in user on Subscription view can start **monthly** or **yearly** Checkout when Stripe is configured.
2. After pay: land on `FRONTEND_URL/?subscription=success` → Subscription view banner; Pro activates when webhook lands (poll/refresh status).
3. Cancel Checkout: `?subscription=cancelled` banner; no charge.
4. Active / past_due / cancel-scheduled Pro users see **Manage billing** (Portal), not a second Subscribe.
5. Portal supports: update payment method, cancel (default Stripe: at period end), resume if allowed, switch monthly↔yearly (Portal products config).
6. Landing Pricing CTAs stay auth-oriented (`onGetStarted`); in-app Subscription is the paid path.
7. When Stripe env incomplete: keep current copy (“Web checkout is not configured yet…”); do not 500 on `plans`.

### 2.2 Backend

1. Create/reuse Stripe Customer linked to `users.id` (+ email).
2. Checkout Session: `mode=subscription`, correct Price ID, `client_reference_id` / metadata `userId`, success/cancel URLs matching SPA.
3. Apply 7-day trial only if user has never had a subscription row with status in (`trialing`,`active`,`past_due`,`canceled` with prior trial/paid) — simplest rule: **no existing `subscriptions` row for user** → trial; else no trial.
4. Webhook endpoint **public** (no JWT); verify `Stripe-Signature` with `STRIPE_WEBHOOK_SECRET`.
5. Persist subscription fields needed for status + entitlement (see design).
6. Idempotent webhook handling (replay-safe).
7. Portal session: `return_url` → `FRONTEND_URL/?subscription=portal_return` (SPA may treat like soft refresh; optional banner).
8. `status` returns usage from `usage_quotas` + limits from free/pro tiers based on entitlement.

### 2.3 Entitlement enforcement (v1)

| Gate | Free | Pro / admin |
|------|------|-------------|
| Image uploads / month (UTC) | 10 | unlimited |
| AI messages / day (UTC) | 20 | 200 |
| Recipe create / import hard cap | not enforced | not enforced |

### 2.4 Ops / Stripe Dashboard

Operator must provide (test then live):

| Item | Notes |
|------|-------|
| Stripe account | Test mode first |
| Product + Prices | Monthly $4.99, Yearly $39.99 USD recurring |
| Price IDs | Into Worker vars |
| Secret key | Worker secret |
| Webhook endpoint | `https://api.lardermind.com/api/subscription/webhook` (+ local Stripe CLI) |
| Webhook events | See design |
| Customer Portal | Enable cancel, payment method update, subscription update (both prices) |
| Branding / business info | Stripe settings |

### 2.5 Legal

- Terms: paid subscription, auto-renew, cancel via Portal / support, pricing reference.
- Privacy: payment processed by Stripe; we store customer/subscription IDs, not full PAN.

---

## 3. Non-goals

- Replacing or implementing Play Billing / StoreKit.
- In-app card fields (Payment Element).
- Coupons, referral credits, pause-subscription custom UX (Portal defaults only).
- Multi-currency localization beyond USD display already in UI.
- Invoice PDF hosting inside LarderMind (Stripe emails / Portal).
- Migrating historical Nest Postgres subscriptions (none in this repo).

---

## 4. Scenarios (must cover)

| # | Scenario | Expected |
|---|----------|----------|
| S1 | First-time monthly Checkout | Trial 7d → `trialing` → Pro; then charge → `active` |
| S2 | First-time yearly Checkout | Same trial rule; yearly price |
| S3 | Checkout abandoned / cancel URL | No Pro; cancelled banner |
| S4 | Success URL before webhook | Banner “activating shortly”; refresh until Pro or timeout copy |
| S5 | Webhook replay / duplicate | Idempotent; no double rows |
| S6 | Renewal success | Stay `active`; `current_period_end` updates |
| S7 | Payment fails (retry) | `past_due`; **still Pro** during grace |
| S8 | Retries exhausted → `unpaid` / canceled | Lose Pro; free limits |
| S9 | Cancel at period end | Pro until `current_period_end`; then not Pro |
| S10 | Immediate cancel (if Portal allows) | Not Pro after webhook |
| S11 | Update payment method in Portal | Remains Pro; no app schema change beyond webhook |
| S12 | Switch monthly ↔ yearly in Portal | Price / period fields update via webhook |
| S13 | Already Pro clicks Subscribe | API returns Portal URL (or 409 + client uses portal) — **no second sub** |
| S14 | User with prior canceled sub re-subscribes | **No** second trial |
| S15 | Stripe misconfigured | `stripeCheckoutEnabled: false`; checkout/portal 503 with clear message |
| S16 | Invalid webhook signature | 400; no DB write |
| S17 | Admin user | Unlimited quotas without Stripe |
| S18 | Free user hits AI / image cap | 403 quota error; Pro not blocked |
| S19 | Deleted Stripe customer / odd state | Webhook or status treats as not Pro; support can clear row |
| S20 | Legal pages | Terms/Privacy mention Stripe subscriptions |

---

## 5. Edge cases / security

| Case | Behavior |
|------|----------|
| Webhook without raw body verify | Reject; never parse then verify |
| Checkout for another user’s session | Impossible: Customer + metadata from JWT `userId` only |
| Price ID tampering | Client sends only `billingPeriod`; server maps to env Price ID |
| Open redirect | Success/cancel/portal return built only from `FRONTEND_URL` |
| Secrets in git | `.dev.vars` / wrangler secrets only |
| Clock skew on trial end | Prefer Stripe status + `current_period_end` over local clock alone |

---

## 6. Acceptance

- [ ] With test keys + prices + webhook (CLI or Dashboard), monthly Checkout completes and `status.isPro` becomes true after webhook
- [ ] Yearly path same
- [ ] Cancel Checkout does not grant Pro
- [ ] Portal opens for Pro user; cancel-at-period-end keeps Pro until end (simulatable in test clock)
- [ ] `past_due` keeps Pro; terminal cancel/unpaid drops Pro
- [ ] Image + AI free caps enforced; Pro/admin unlimited (AI 200/day)
- [ ] `stripeCheckoutEnabled` false when any required env missing
- [ ] Terms + Privacy updated; `docs/legal/README.md` notes subscriptions disclosed
- [ ] Mobile IAP still out of path (no Play Billing regression required)
- [ ] Unit/integration tests for entitlement helper + webhook signature failure + status mapping

---

## 7. References

- Design: [web-stripe-subscription-design.md](../design/web-stripe-subscription-design.md)
- Tasks: [tasks/web-stripe-subscription/](../../tasks/web-stripe-subscription/)
- Store split: [store-launch-todo.md](../store-launch-todo.md)
- Current stub: `backend-cf/src/routes/subscription.ts`
- Frontend client: `frontend/src/api/subscription.ts`
