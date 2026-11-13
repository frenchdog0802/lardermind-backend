# Fix Design: Subscribe button stuck on “Redirecting…” after closing Stripe checkout

**Bug:** `docs/bugs/checkout-redirecting-stuck.md`  
**RCA:** `docs/rca/checkout-redirecting-stuck-rca.md`  

---

## Fix Approach

Reset outbound-redirect loading when the document is restored or becomes visible again after leaving Stripe (or the customer portal):

1. **`UpgradeButtons`:** On mount, listen for `pageshow`. If `event.persisted` (bfcache restore), call `setLoadingPlan(null)`. Also clear on `visibilitychange` when `document.visibilityState === 'visible'` while a redirect is in progress (covers return without bfcache edge cases). Keep clearing in `catch`.
2. **`SubscriptionPanel`:** Apply the same reset for `portalLoading` when opening the billing portal.
3. **Optional small helper** (preferred if it keeps the test fail-first clean): e.g. `shouldClearOutboundRedirectLoading({ persisted?, visibilityState? })` used by both listeners — unit-test the decision; source-assert listeners are wired.

Do **not** clear loading immediately before `location.href` assignment in a way that re-enables a double-click race during the brief moment before unload; reset only on return / restore / error.

## Alternatives Considered

| Option | Why rejected |
|--------|----------------|
| Full page reload on cancel URL only | Does not fix Back / bfcache / closed-tab return to an already-open SPA tab |
| Open Checkout in `window.open` popup and poll `closed` | Changes product navigation contract; larger than needed |
| Clear loading right after setting `location.href` | Can flash enabled buttons and allow double checkout session creation before unload |

## Scope of Change

- `frontend/src/components/UpgradeButtons.tsx`
- `frontend/src/components/SubscriptionPanel.tsx` (portal loading)
- Small helper under `frontend/src/utils/` (if used)
- Regression test(s) under `frontend/src/**/*.test.ts`
- Mark bug Resolved

## Data Migration / Backfill Needs

None.

## Rollback Plan

Revert the frontend listener/helper changes. Stuck **Redirecting…** returns.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Clearing loading while Stripe tab still loading in same document | Same-document navigation unloads the SPA; listeners run on return only |
| Visibility clear fires too early mid-API | Only clear when already in “redirecting” state **and** page becomes visible again after having been hidden, or on `persisted` pageshow — implement carefully so in-flight `createCheckout` is not cleared mid-await unless the tab was backgrounded and foregrounded without navigation |

**Refined visibility rule:** Prefer **`pageshow` + `persisted`** as the primary fix (matches RCA). Add `pageshow` without persisted as a no-op. Optionally also reset on `pageshow` always when `loadingPlan !== null` after any full navigation return — actually non-persisted pageshow on first load would clear null anyway.

Simplest safe rule:

- On every `pageshow`, if `event.persisted`, clear outbound loading.
- On `pagehide` / leaving, no change.
- Keep error-path clear.

If product still sees stuck state without bfcache (rare), follow-up: clear on `focus` when `loadingPlan` set and `performance.getEntriesByType('navigation')` — out of v1 unless needed.

## Regression Test Plan

1. Fail-first: assert `UpgradeButtons` (and portal path) registers a `pageshow` handler that clears loading on `persisted` (source contract and/or helper unit test).
2. Manual: start monthly checkout → Back from Stripe → buttons show Subscribe labels again.
3. Manual: cancel return URL still shows cancelled banner and usable buttons.
4. Error path: failed checkout API still shows error and clears loading.
