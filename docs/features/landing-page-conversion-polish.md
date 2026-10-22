# Feature: Landing page conversion polish

**Status:** Implemented  
**Scope:** Web marketing landing (`frontend/src/components/MarketingLanding.tsx`, `PricingSection.tsx`, new static product mock)  
**Out of scope:** Backend/API changes, authenticated app screens, SEO meta changes, App Store / Play Store badge links (apps not publicly listed yet), paid ad creatives, i18n of marketing copy (landing remains English hard-coded like today)

**Design:** [landing-page-conversion-polish-design.md](../design/landing-page-conversion-polish-design.md)  
**Tasks:** [tasks/landing-page-conversion-polish/](../../tasks/landing-page-conversion-polish/)

---

## 1. Summary

The public landing page under-communicates what people get: Pro price/benefits are vague (“High-volume AI”), platforms are unclear, primary CTAs say “Get started” instead of “Sign up free”, how-it-works visuals are generic stock photos instead of product UI, and there is no short competitive FAQ (Mealime / SuperCook).

This feature tightens conversion copy and adds a **static in-page Warm Kitchen mock** of a weekly Calendar plan + Shopping List.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Product visual | Static in-page React mock (Calendar week + grocery list), not a screenshot/GIF file | No real capture assets; mock can match Warm Kitchen tokens exactly |
| Theme | Existing Warm Kitchen tokens (`linen` / `herb` / `sage` / `ink` / `line`) | Match live app; do not introduce new brand oranges on landing |
| Platforms | Text line: Web · iOS · Android; **no** store badges | Mobile exists; public App Store / Play listing not ready (`docs/store-launch-todo.md`) |
| Pro price | Always show `$4.99/mo` and `$39.99/yr` (API when available; static fallback if plans fail) | Visitors must see price without waiting on / failing API |
| Pro benefit copy | Concrete limits (AI messages/day, imports, recipes, uploads) — no “High-volume AI” | People need to know what they pay for |
| Primary CTA label | **Sign up free** (hero + beside demo; keep Log in secondary) | Clear free-path CTA above the fold |
| How-it-works steps | Keep **01 / 02 / 03** all numbered | Consistency; avoid “only 03 numbered” impression |
| Competitive FAQ | Short FAQ section vs Mealime and SuperCook | Answer “why this?” without a full comparison page |

---

## 2. Requirements

### 2.1 Hero (above the fold)

1. Primary button label: **Sign up free** (calls existing `onGetStarted`).
2. Secondary: Log in (unchanged behavior).
3. Short platforms line under CTAs: e.g. `Works on Web · iOS · Android` (no badge images).

### 2.2 Demo section

1. Beside / under the demo copy column, a clear **Sign up free** button (may replace “Get started free”).
2. Demo chat box behavior unchanged (`GuestChatBox`).

### 2.3 Product mock (Calendar + Shopping List)

1. New section (or replace stock “how it works” imagery) showing a **non-interactive** mock of:
   - A weekly meal plan (several days with meal names).
   - A grocery / shopping list with checked + unchecked items.
2. Visual language: Warm Kitchen (borders, herb accents, Fraunces/Source Sans already on site).
3. Decorative only: no API calls, no click handlers that mutate state; optional `aria-hidden` on decorative chrome with a short accessible caption for the section.
4. Copy nearby that ties plan → missing ingredients → shopping list.

### 2.4 How-it-works steps

1. All three feature steps show numbers **01**, **02**, **03** (or remove numbers from all — prefer keep all three).
2. Prefer product-relevant imagery: the new mock can be the primary visual for this story; stock Unsplash rows may stay or be reduced if redundant.

### 2.5 Pricing

1. Subtitle must not use “High-volume AI”.
2. Explain Pro as higher AI chat allowance, more recipe imports, higher recipe/image limits (match Free vs Pro rows).
3. Pro cards always render with price display even when `getPlans()` fails (fallback constants matching backend: `$4.99/mo`, `$39.99/yr`).

### 2.6 FAQ

1. New `#faq` section with at least:
   - How is LarderMind different from Mealime?
   - How is it different from SuperCook?
   - Optional: Is there a free plan? / Where can I use it?
2. Honest, short answers: pantry-first + AI chat + closed loop (plan → shop → cook), not a recipe browser clone.

### 2.7 Nav

1. Optional FAQ link in top nav next to Pricing.

---

## 3. Acceptance

1. Hero shows **Sign up free** + platforms line; no store badges.
2. Demo column has **Sign up free**.
3. Landing includes a Warm Kitchen Calendar + Shopping List mock with sample weekly plan and grocery items.
4. Pricing copy names concrete Pro benefits; Pro prices visible without a successful API response.
5. FAQ answers Mealime and SuperCook differences.
6. Steps 01–03 all numbered (or none).
7. No backend changes; guest chat and auth CTAs still wire to existing handlers.

---

## 4. Edge cases

| Case | Handling |
|------|----------|
| `/api/subscription/plans` fails | Show Free + Pro monthly/yearly with hardcoded fallbacks; keep trial blurb only if known |
| Reduced motion | Mock is static CSS (no motion required); hero Remotion path unchanged |
| Mobile width | Mock stacks (week plan above list) under `lg` |
| Competitor trademark | Use plain names in FAQ; factual comparison, no disparagement |

---

## 5. Out of scope / follow-ups

- App Store / Google Play badge links when public URLs exist.
- Real device screenshots / GIF capture.
- Localized marketing copy (zh).
- Changing Stripe prices (display only mirrors current `$4.99` / `$39.99`).
