# RCA: Subscribe button stuck on “Redirecting…” after closing Stripe checkout

**Bug:** `docs/bugs/checkout-redirecting-stuck.md`  
**Status:** Confirmed via code inspection — fixed per fix design  

---

## Root Cause

`UpgradeButtons` sets `loadingPlan` when checkout starts and only clears it in the `catch` path. On success it assigns `window.location.href` to the Stripe URL and **never resets** `loadingPlan`.

When the user returns to the SPA without a fresh mount — most commonly **browser Back** restoring the page from the **bfcache** (`pageshow` with `event.persisted === true`) — React state is revived with `loadingPlan` still set. The UI stays on **Redirecting…** with both buttons `disabled={loadingPlan !== null}`.

There is no `pageshow` / focus / visibility handler to clear redirect loading after an abandoned external navigation.

## Contributing Factors

1. Success path treats navigation as terminal (`return` after `location.href`) and assumes the document will be discarded; bfcache invalidates that assumption.
2. Shared `loadingPlan` disables **both** plan buttons, so one stuck redirect locks the whole upgrade CTA group.
3. `SubscriptionPanel.openPortal` uses the same pattern (`portalLoading` cleared only on error), so **Manage billing** can stick on **Opening…** the same way.

## Affected Components

| Component | Role |
|-----------|------|
| `UpgradeButtons.tsx` | Sets / never clears `loadingPlan` after successful checkout URL handoff |
| `SubscriptionPanel.tsx` | Same for `portalLoading` after portal URL handoff |
| Browser bfcache | Restores JS heap including stuck loading flags |

## Data / State Impact

None in D1/Stripe. Pure client UI state. No incorrect subscription writes.

## Timeline

Present since web Stripe checkout buttons (`tasks/web-stripe-subscription` frontend checkout work).

## Why it wasn't caught earlier

Happy-path tests/docs focus on success/cancel **return URLs** (full remount, clean state). Abandon via Back / close → bfcache restore was not covered.
