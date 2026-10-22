# Design: Landing page conversion polish

**Feature:** [landing-page-conversion-polish.md](../features/landing-page-conversion-polish.md)

## 1. Where it fits

| Layer | Change |
|-------|--------|
| `frontend/src/components/MarketingLanding.tsx` | Hero CTA/platforms, demo CTA, product mock section, FAQ, step numbering keep |
| `frontend/src/components/PricingSection.tsx` | Benefit copy + static plan fallbacks |
| `frontend/src/components/ProductPreviewMock.tsx` | **New** — static Calendar week + Shopping List mock |
| Backend / mobile / GuestChatBox | Unchanged |

## 2. Architecture

```
MarketingLanding
├── nav (Pricing, FAQ?, Log in)
├── hero → Sign up free + platforms line
├── demo-chat → copy + Sign up free | GuestChatBox
├── ProductPreviewMock (week plan + grocery list)
├── pain points (unchanged)
├── how-it-works (01–03 numbered; may drop redundant Unsplash if mock covers story)
├── PricingSection (fallback prices)
├── FAQ
├── join CTA
└── footer
```

No new routes. All marketing English strings stay inline (same as today).

## 3. `ProductPreviewMock`

### 3.1 Layout

- Section title + one supporting sentence.
- `lg:grid-cols-2`: left = **This week** (list-style week hub, mirrors Calendar list mode), right = **Shopping list**.
- Mobile: stack plan then list.
- Container: `border border-line bg-surface`, inner panels `bg-linen` / `bg-sage/20` accents — no card chrome beyond what the app already uses (hairline borders).

### 3.2 Sample content (fixed)

**Week plan** (illustrative, not live data):

| Day | Meal |
|-----|------|
| Mon | Lemon garlic chicken + rice |
| Tue | Veggie fried rice (use leftovers) |
| Wed | Tomato pasta |
| Thu | Sheet-pan salmon |
| Fri | Tacos from pantry beans |
| Sat | Stir-fry night |
| Sun | Soup + leftover bread |

Show meal type chips (Dinner) in herb/sage styling.

**Shopping list** (mix checked/unchecked):

- Chicken thighs — 1 pack  
- Lemons — 2  
- Garlic — 1 bulb *(checked)*  
- Pasta — 500g  
- Salmon fillets — 2  
- Tortillas — 1 pack  
- Baby spinach — 1 bag *(checked)*

Checkmarks: herb circle + check for done rows; muted strikethrough text.

### 3.3 Accessibility

- Section has a real `<h2>` and short `<p>`.
- Mock chrome may use `aria-hidden="true"` on purely decorative window dots; list content remains in the accessibility tree as static text (or entire mock in a `figure` with `figcaption`).

### 3.4 Interactivity

- No buttons that call APIs.
- Not a Remotion animation (static HTML/CSS).

## 4. Pricing fallbacks

Constants aligned with `backend-cf/src/routes/subscription.ts`:

```ts
const FALLBACK_PLANS = {
  trialDays: 7, // only show if API provided; if fail, omit trial or use known product default if already public
  free: { aiMessagesPerDay: 20, recipeImportsPerMonth: 3, maxRecipes: 50, imageUploadsPerMonth: 10 },
  pro: { aiMessagesPerDay: 200, recipeImportsPerMonth: 50, maxRecipes: -1, imageUploadsPerMonth: -1 },
  plans: [
    { name: 'Pro Monthly', billingPeriod: 'monthly', priceDisplay: '$4.99/mo', ... },
    { name: 'Pro Yearly', billingPeriod: 'yearly', priceDisplay: '$39.99/yr', ... },
  ],
};
```

On API success: use response. On failure: use fallbacks so Pro prices always render.

Subtitle copy example:

> Full kitchen on Free. Pro raises daily AI chat, recipe imports, and upload limits.

Not: “high-volume AI”.

## 5. FAQ content (v1)

1. **How is LarderMind different from Mealime?**  
   Mealime is a strong meal-plan + grocery workflow. LarderMind is pantry-first and chat-first: you talk to an AI that remembers preferences, plans from what you already have, and closes the loop into calendar + shopping + pantry.

2. **How is it different from SuperCook?**  
   SuperCook focuses on “what can I make from these ingredients?” as a recipe finder. LarderMind covers that idea inside a full kitchen loop—ongoing pantry, weekly plan, shopping list, and cooking confirmation—not only one-shot recipe search.

3. **Is it free?**  
   Yes — Free includes pantry, shopping, calendar, and daily AI allowance. Pro unlocks higher limits.

4. **Where does it run?**  
   Web now; iOS and Android apps available in the LarderMind family (no store badge links until public listing URLs exist).

## 6. CTA copy map

| Location | Label |
|----------|-------|
| Hero primary | Sign up free |
| Demo primary | Sign up free |
| Pricing Free | Sign up free (or keep Get started free → unify to Sign up free) |
| Pricing Pro | Start with monthly/annual Pro |
| Bottom join | Sign up free |

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Mock drifts from real Calendar UI | Keep simplified list layout; don’t clone full Calendar.tsx |
| Fallback prices drift from Stripe | Comment + constants next to backend prices; update both when prices change |
| Competitor FAQ feels attacky | Stay factual; one sentence each |

## 8. Rollback

Revert the three component files; no schema/migrations.
