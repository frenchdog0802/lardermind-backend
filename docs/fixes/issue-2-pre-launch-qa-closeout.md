# Closeout: Pre-launch QA (issue #2) — Oct 27 batch

Pasteable summary for [lardermind-backend#2](https://github.com/frenchdog0802/lardermind-backend/issues/2):

## Shipped (on origin)

**Product calls**
- Guest demo copy = **5 AI msgs/day** (enforcement unchanged).
- Pro AI limit **200 → 150** (backend + pricing/subscription copy).
- Free plan + upgrade + quota upsell advertise **7-day Pro trial** (starts at Stripe).
- Removed recipe URL/social **import** claims (landing, pricing, subscription, empty-state prompts).

**Priority bugs**
- EN chat language: system prompt + tool name/unit must match user message language.
- “no tool was started”: grocery/plan asks no longer false-positive; soft fallback uses model text when tools never start.

**Must-fix**
- Quota hit → signup / Start 7-day Pro trial CTA (guest + in-app).
- Plan from ingredients in the prompt; no invented quantities; merge pantries (prompt rules).
- Guest demo shows “Starting demo…” while minting.
- Web API base URL inlined at build (`55dbb44`+).

**Should-fix (bounded)**
- Recipe quality prompt; skip subscription status without JWT; GIS redirect (no One Tap prefill); signup password rules (8+); see `issue-2-and-3-should-fix-closeout.md`.

## Related

- Usage / recipes saved 0 → fixed via claim merge + `countRecipes` (issue #3.4).
- Setup guide blocking UI → unmounted + localStorage clear (issue #3.11–12).
