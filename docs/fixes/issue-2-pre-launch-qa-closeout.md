# Closeout: Pre-launch QA (issue #2) — Oct 27 batch

Pasteable summary for [lardermind-backend#2](https://github.com/frenchdog0802/lardermind-backend/issues/2):

## Shipped

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

## Deferred (after Stripe live)

- Usage counter accuracy / recipes saved 0
- Setup guide blocking calendar Add
- Should-fix items (richer recipes, 401 noise, password rules, etc.)
- Shopping “generate list” button, image-upload discoverability, recipe import UI

`gh` was not available in this environment to post the comment automatically.
