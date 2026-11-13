# RCA: Guest demo controls disabled

**Bug:** `docs/bugs/guest-demo-controls-disabled.md`  
**Status:** Confirmed via code inspection

## Root cause

`minting` starts true when no guest token; UI disables controls via `busy` but does not show a dedicated starting state in the composer area.
