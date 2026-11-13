# Design: Pre-launch entitlement messaging

**Feature:** [pre-launch-entitlement-messaging.md](../features/pre-launch-entitlement-messaging.md)

## 1. Where it fits

| Layer | Change |
|-------|--------|
| `backend-cf/src/lib/entitlement.ts` | `PRO_TIER.aiMessagesPerDay` 200 → 150 |
| `backend-cf/src/db/quotas.ts` (+ tests) | Comments / assertions for Pro 150 |
| `frontend/.../PricingSection.tsx` | FALLBACK Pro 150; remove import LimitRows; trial-on-upgrade copy |
| `frontend/.../SubscriptionPanel.tsx` | Trial on Free; upgrade blurb; hide import UsageRow |
| `frontend/.../MarketingLanding.tsx` | Drop import bullets/FAQ; guest 5/day near Live try |
| `frontend/.../GuestChatBox` + i18n | Guest footer / limit hint 5/day |
| Quota upsell UI | Separate must-fix bug (chat 403/quota → CTA) |

## 2. Data / API

No schema change. Plans response already returns `FREE_TIER` / `PRO_TIER` / `trialDays`. Status may still include `recipeImportsUsed/Limit`; clients stop rendering those rows.

## 3. Copy rules

| Surface | Before (bad) | After |
|---------|--------------|--------|
| Guest demo | Implied ~20 | “Guest demo: 5 AI messages / day” |
| Pricing trial | “New accounts get 7 days of Pro” | “Start a 7-day Pro trial when you upgrade” |
| Free plan subtitle | “You are on the Free plan.” | Free + “Upgrade anytime for a 7-day Pro trial.” |
| Upgrade card | 200 msgs + 50 imports | 150 msgs/day; unlimited recipes/uploads; 7-day trial; no imports |

## 4. Risks

| Risk | Mitigation |
|------|------------|
| Stale hardcoded “200” in FE | Grep + source tests on SubscriptionPanel / PricingSection |
| Users expect auto-trial on signup | Explicit upgrade wording only |

## 5. Rollback

Revert entitlement Pro to 200 and restore prior FE copy/rows.
