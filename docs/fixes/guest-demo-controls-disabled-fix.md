# Fix: Guest demo controls disabled

**Bug:** `docs/bugs/guest-demo-controls-disabled.md`  
**RCA:** `docs/rca/guest-demo-controls-disabled-rca.md`

## Fix approach

When `minting || !guestToken`, show a clear “Starting demo…” line above/near the composer (and keep controls disabled). i18n `ai.guestStarting`.

## Scope

GuestChatBox + en/zh strings.
