# Design: Web Agent Stage Shell

**Feature:** [web-agent-stage-shell.md](../features/web-agent-stage-shell.md)

## 1. Shell architecture

```
App authenticated
├─ AppDrawer variant=rail|overlay
└─ main (flex-1)
   └─ views (Chat, Calendar, …)
```

Breakpoint: **768px** (`md` / `matchMedia('(min-width: 768px)')`).

### AppDrawer

| | Rail (`md+`) | Overlay (`<md`) |
|--|--------------|-----------------|
| Position | In-flow / sticky `h-dvh`, `w-72`, `border-r` | `fixed` slide-in |
| Backdrop | None | ink/30 |
| Close control | None | X + Esc + backdrop |
| `role` | `navigation` | `dialog` + `aria-modal` |
| Sessions fetch | When mounted / visible | When `open` |
| After navigate | Stay open | `onClose()` |

### App.tsx

- `useMediaQuery` for desktop rail.
- Pass `variant` + `open={rail || drawerOpen}`.
- Body scroll lock **only** for mobile overlay open.
- Pass `onOpenMenu={undefined}` on desktop (hide hamburger in `AppHeader`).

## 2. Chat stage

### Empty (`messages.length === 0`)

- Full remaining viewport centers: `ChatEmptyState` + composer block.
- Greeting: `font-display text-3xl sm:text-4xl`.
- Soft radial: e.g. `radial-gradient(ellipse at 50% 40%, #D8E0D033, transparent 55%)` on linen (sage tint, low opacity).

### Active

- Existing scroll column + bottom composer.
- Assistant prose: `text-base leading-relaxed` (bump from default small feel).
- Keep prior: user min-width bubble, hover timestamps, no placeholder.

## 3. Risks

| Risk | Mitigation |
|------|------------|
| Narrow laptop + rail squeezes Chat | Rail `w-64`–`w-72`; content `min-w-0` |
| Hydration flash | SPA only; initial matchMedia sync |
| Double New chat | Keep header `+` + rail CTA (intentional) |

## 4. Files

- `frontend/src/App.tsx`
- `frontend/src/components/AppDrawer.tsx`
- `frontend/src/components/AppHeader.tsx` (optional: already hides when no `onOpenMenu`)
- `frontend/src/components/AICookingAssistant.tsx`
- `frontend/src/components/ChatEmptyState.tsx`
- Optional: `frontend/src/hooks/useMediaQuery.ts`
