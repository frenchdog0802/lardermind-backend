# Checklist: first-win-bootstrap

## Phase A — Stop homework

- [x] Unmount SetupGuide from App.tsx; cleanup setupGuide localStorage
- [x] Web ChatEmptyState: emptyHint + paste-first CTAs; demote hub chips
- [x] Mobile ChatEmptyState: align paste-first
- [x] Hub empty escape hatch to Chat (minimal)
- [x] Supersede web-setup-guide feature doc

## Phase B — Paste-list first win

- [x] system-prompt first-win orchestration
- [x] i18n prompts en/zh web + mobile
- [x] Prompt/system tests

## Phase C — Guest backend

- [x] Migration is_guest / expires_at / guest_rate_limits
- [x] JWT guest claim; auth middleware isGuest
- [x] POST /api/auth/guest + rate limit
- [x] Claim guest on signup/signin/google + POST claim-guest
- [x] Tool allowlist + signup_required
- [x] Guest AI quota (5/day)
- [x] TTL cleanup (lazy + hourly cron)
- [x] Chat IP rate limit on send/stream
- [x] requireNonGuest on closed-loop REST
- [x] Tests (allowlist, rate limits, guest quota)

## Phase D — Web guest UX

- [x] GuestChatBox on landing (real AI)
- [x] sessionStorage guest_token → claim after signup
- [x] Demote scripted DemoChatBox (kept as file; landing uses GuestChatBox)

## Phase E — Mobile guest UX

- [x] Try without account on auth stack
- [x] Guest banner + signup_required handling
- [x] Empty state parity (from A/B)
- [x] SaveKitchen signup from Main (claim guest kitchen)
