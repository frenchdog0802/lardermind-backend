# Checklist: Web Stripe subscription

## Phase 1 — Data & config

- [x] 01 — D1 migration `subscriptions` + `stripe_webhook_events`
- [x] 02 — Env / wrangler / `.dev.vars.example` Stripe vars
- [x] 03 — Stripe client + entitlement helpers

## Phase 2 — API

- [x] 04 — Plans + status (real entitlement)
- [x] 05 — Checkout Session
- [x] 06 — Customer Portal
- [x] 07 — Webhook handler (all listed events + idempotency)

## Phase 3 — Quotas

- [x] 08 — Wire `isPro` into image upload / pantry-vision
- [x] 09 — Enforce AI messages per UTC day

## Phase 4 — Frontend

- [x] 10 — `createPortal` + Manage billing UX
- [x] 11 — Checkout 409/503 handling + portal_return

## Phase 5 — Legal & docs

- [x] 12 — Terms + Privacy + legal README
- [x] 13 — backend-cf README ops (CLI, Dashboard, secrets)

## Phase 6 — Verify

- [x] 14 — Unit / route tests
- [~] 15 — Acceptance scenario smoke (S1–S20 as applicable) — API path green locally; UI / yearly / past_due / live still open

## Feature acceptance (from requirements)

- [x] Test Checkout monthly → webhook → `isPro` (API smoke 2026-09-28: session URL + signed `customer.subscription.created` → Pro/trial)
- [ ] Yearly path
- [ ] Cancel Checkout → not Pro
- [ ] Portal + cancel-at-period-end behavior
- [ ] `past_due` keeps Pro; terminal drops Pro
- [x] Image + AI caps; Pro/admin unlimited (AI 200/day) — unit covered
- [x] `stripeCheckoutEnabled` false when misconfigured
- [x] Legal updated
- [x] Mobile IAP still out of scope / untouched
- [x] Already Pro → checkout returns 409 + portalUrl (API smoke)
