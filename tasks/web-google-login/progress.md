# Progress: Web Google login

**Started:** 2026-09-19  
**Status:** Complete (code); operator deploy remaining

| Task | Status |
|------|--------|
| 01 Env FRONTEND_URL + GOOGLE_CLIENT_ID | ✅ |
| 02 Google verify + upsertGoogleUser | ✅ |
| 03 google-login + google-callback routes | ✅ |
| 04 README + frontend env | ✅ |
| 05 Tests | ✅ |
| 06 Acceptance | ✅ (manual prod GIS click after deploy) |

## Notes

- Web Client ID + `FRONTEND_URL=https://lardermind.com` in `wrangler.toml` `[vars]`.
- Frontend local `.env` updated; Pages CI needs Actions var `VITE_GOOGLE_CLIENT_ID` (same ID) and `VITE_API_BASE_URL=https://api.lardermind.com`.
- Redeploy Worker for production Google routes to go live.
