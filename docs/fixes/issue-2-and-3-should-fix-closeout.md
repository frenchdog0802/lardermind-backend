# Closeout: Issues #2 / #3 Should-fix (bounded)

## Shipped

| Item | Fix |
|------|-----|
| #2.8 Vague recipes | System prompt requires quantities, cook times, steps; avoid bland water+salt patterns |
| #2.9 Anonymous 401 | `subscriptionApi.getStatus` skips fetch when no JWT |
| #2.10 Google One Tap | Confirmed GIS **redirect** button (no One Tap prefill) — expected |
| #2.11 Password rules | Signup shows “At least 8 characters”; signup schema `min(8)` |
| #3.7 HITL progress | Approve shows **Applying…** while `resumeInFlight` |
| #3.8 Early auto-title | Title only after non-interrupt turn; also after resume complete |
| #3.9 cups vs kg | Prompt: state conversion / ask; do not invent pantry qty |
| #3.10 Calendar UX | Month desktop shows truncated meal names; list expands all days with meals |
| #3.11–12 Setup Guide | Already unmounted + `clearSetupGuideLocalStorage` (Phase 1) |
| #3.13 Log This Meal | Recipe save CTA → **Save recipe** |

## Docs

Must-fix bug triads live under `docs/bugs|rca|fixes` for Phase 1–2 items. This file records Should-fix that were bounded prompt/UI changes without separate open bugs.
