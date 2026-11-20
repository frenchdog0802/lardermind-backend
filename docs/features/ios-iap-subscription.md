# Feature: iOS App Store subscription (StoreKit 2) on `backend-cf`

**Status:** Implemented, unit-tested with a synthetic Apple chain; not yet exercised against real Apple Sandbox traffic.
**Scope:** Validate StoreKit 2 signed transactions, receive App Store Server Notifications V2, grant the *same* Pro entitlement as Stripe.
**Out of scope:** Android / Play Billing, App Store Server API calls (no Apple API key needed), promo offers.

## Design

| Decision | Choice |
|----------|--------|
| Proof of purchase | StoreKit 2 signed transaction (JWS). Legacy base64 receipts and bare transaction ids are rejected. |
| Trust | `x5c` chain must end in a **pinned Apple Root CA - G3** (SHA-256 `63343abf…e9179`), every cert signature + validity checked (evaluated at the payload's `signedDate`), Apple marker OIDs required, then the ES256 signature. WebCrypto + a small DER reader, no Node-only deps (`src/lib/apple-jws.ts`). |
| Checks on every transaction | `bundleId == com.lardermind.app` (`APPLE_BUNDLE_ID`), `productId` ∈ {monthly, yearly}, type auto-renewable, `environment` ∈ `APPLE_ALLOWED_ENVIRONMENTS` (default `Production,Sandbox`). |
| Storage | New table `apple_subscriptions` (migration `0015`), keyed by `original_transaction_id`: `user_id`, product, `status`, `environment`, `expires_at`, `trial_end`, `auto_renew`, `revoked_at`, `last_signed_at`. A separate table (not the Stripe `subscriptions` row) because that row is 1-per-user with a NOT NULL Stripe customer id. |
| Entitlement | `resolveEntitlement()` merges both sources: Pro if Stripe is entitled **or** an Apple row is entitled *and not past `expires_at`*. Same `isPro` → same quotas (`PRO_TIER`, 300 AI msgs/week, unlimited images). Stripe wins when both are active. |
| Statuses | `trialing` (intro free trial), `active`, `past_due` (Apple billing grace, still Pro), `expired`, `revoked` (refund/revoke). |
| Account linking | A subscription already active on account A cannot be claimed by account B (409). Once expired it can be re-linked. Notifications never move a subscription between accounts. |
| Ordering / replay | Updates with a `signedDate` older than the stored state are ignored, so a stale client receipt can't undo a refund; notifications are idempotent per `notificationUUID`. |

## Endpoints

| Route | Auth | Body | Result |
|-------|------|------|--------|
| `POST /api/subscription/validate-receipt` | JWT, non-guest | `{platform:"ios", receipt:<JWS>, productId}` | `{valid, expiresAt, productId, status}` |
| `POST /api/subscription/sync` | JWT, non-guest | same (+ `transactionId` ignored) | `{success, status}` (what the mobile client reads) |
| `POST /api/subscription/apple-notifications` | none (JWS-authenticated) | `{signedPayload}` | `200 {received:true}`; 400 invalid signature; 5xx → Apple retries |
| `GET /api/subscription/status` | JWT | – | now also returns `source: "stripe" \| "apple"` |

Handled notification types: `SUBSCRIBED`, `DID_RENEW`, `OFFER_REDEEMED`, `DID_CHANGE_RENEWAL_PREF/STATUS`, `RENEWAL_EXTENDED`, `REFUND_REVERSED`, `PRICE_INCREASE` (state re-derived from the transaction); `EXPIRED`, `GRACE_PERIOD_EXPIRED`, `DID_FAIL_TO_RENEW` (grace → `past_due`, else expired); `REFUND`, `REVOKE` (→ `revoked`). Everything else (`TEST`, `CONSUMPTION_REQUEST`, …) is acknowledged and ignored. Notifications for an unknown `originalTransactionId` are acknowledged; the client's own sync links it.

## Ops

- App Store Connect → App → App Information → App Store Server Notifications: set **Production Server URL** and **Sandbox Server URL** to `https://api.lardermind.com/api/subscription/apple-notifications` (version 2). The app ships against the production API even in TestFlight, so sandbox purchases also land there; the payload's `environment` is recorded per row.
- Apply migration `0015_apple_subscriptions.sql` (`db:migrate:staging` / `db:migrate:remote`) **before** deploying; `resolveEntitlement` queries the new table.
- No new secrets. Optional vars: `APPLE_BUNDLE_ID`, `APPLE_ALLOWED_ENVIRONMENTS` (set to `Production` after launch if sandbox purchases should stop granting Pro).

## Tests

`src/lib/apple-jws.test.ts` (chain, tamper, wrong root, expiry, OIDs, alg), `src/routes/subscription-apple.test.ts` (validate/sync, linking, Stripe merge, every notification type, replay/out-of-order, environments). Fixtures build a synthetic root→intermediate→leaf chain (`src/test-utils/apple-fixtures.ts`).
