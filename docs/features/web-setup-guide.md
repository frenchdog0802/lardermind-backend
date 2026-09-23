# Feature: Web Setup Guide (Stripe-style)

**Status:** Implemented  
**Scope:** Web desktop (`frontend/`) — floating right Setup guide panel  
**Out of scope:** Mobile, backend schema changes, subscription step, empty-Chat duplicate card

**Design:** [web-setup-guide-design.md](../design/web-setup-guide-design.md)  
**Tasks:** [tasks/web-setup-guide/](../../tasks/web-setup-guide/)

---

## 1. Summary

Add a Stripe-like **Setup guide** floating on the **bottom-right** of the authenticated desktop web app. Guides new users through kitchen bootstrap in dependency order.

### Locked decisions

| Decision | Choice |
|----------|--------|
| Placement | Desktop **bottom-right floating panel** (Stripe pattern) |
| Mobile | **Later** (hidden for now) |
| Theme | Warm Kitchen (herb / sage / linen) — no Stripe purple |
| Step order | Pantry → Recipes → Chat AI → Plan meals → Shopping |
| Plan meals | One section; CTAs: open Calendar **or** ask AI to plan |
| Locking | Later sections locked until previous section complete |
| Dismiss | X persists in `localStorage` until cleared / new account |

### Steps

1. **Stock pantry** — ≥1 pantry item  
2. **Add recipes** — ≥1 recipe  
3. **Chat with AI** — ≥1 chat session with activity (or first send marked)  
4. **Plan meals** — ≥1 meal plan entry  
5. **Shopping list** — ≥1 shopping item  

---

## 2. Acceptance

1. `md+` authenticated: panel visible (unless dismissed / all done + dismissed).
2. Progress bar reflects completed sections / 5.
3. Accordion; locked sections show lock, not expandable.
4. CTA navigates to Inventory / Recipes / Chat / Calendar / Shopping; AI plan prefills Chat.
5. `<md`: panel not shown.
6. Warm Kitchen tokens only.
