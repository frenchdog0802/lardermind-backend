# Bug: Subscribe button stuck on “Redirecting…” after closing Stripe checkout

**Status:** Resolved  
**Severity:** Major  
**Type:** UI / navigation state  
**Surface:** Settings → Your plan → Upgrade to Pro (`UpgradeButtons`)

---

## Current behavior

User starts Pro checkout (e.g. monthly). The primary button shows **Redirecting…** and both upgrade buttons stay disabled.

After the user leaves Stripe Checkout (closes the checkout window/tab, or returns via browser Back / cancel without completing payment), the plan page still shows **Redirecting…** and the buttons remain unusable until a full page reload.

Reporter screenshot: Free plan, usage visible, monthly button stuck on **Redirecting…**, yearly still labeled but both effectively blocked by the shared loading lock.

## Expected behavior

If checkout is abandoned or the user returns to the plan page without a completed subscription, upgrade buttons return to their normal labels and become clickable again (no stuck **Redirecting…** state).

## Reproduction

1. Sign in as a Free user.
2. Open Settings → Your plan (or Subscription).
3. Click **Subscribe monthly — $4.99** (or yearly).
4. On Stripe Checkout, close the window/tab or navigate back without paying.
5. Observe the plan page still showing **Redirecting…** with disabled buttons.

## Related files

- `frontend/src/components/UpgradeButtons.tsx`
- `frontend/src/components/SubscriptionPanel.tsx` (same pattern for **Manage billing** / `portalLoading`)
- `frontend/src/api/subscription.ts` (`createCheckout` / `createPortal`)

## Impact

Users who abandon or cancel Stripe Checkout cannot retry upgrade without refreshing the page. Blocks conversion recovery on the plan screen.

## Environment

Web app (reporter: Windows desktop). Stripe Checkout redirect flow.

## Related documents

- `docs/features/web-stripe-subscription.md`
- `docs/design/web-stripe-subscription-design.md`
- `tasks/web-stripe-subscription/11-frontend-checkout-returns.md`
