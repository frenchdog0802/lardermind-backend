# Fix: Web API base URL indirect env

**Bug:** [web-api-base-url-indirect-env.md](../bugs/web-api-base-url-indirect-env.md)  
**RCA:** [web-api-base-url-indirect-env-rca.md](../rca/web-api-base-url-indirect-env-rca.md)

## Fix approach

In `frontend/src/api/client.ts`, set BASE_URL with a **direct** Vite env read:

```ts
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';
```

Remove the `readApiBaseUrl` indirection (or keep a helper that only returns the already-inlined constant).

Add a source-level regression test asserting `client.ts` contains `import.meta.env.VITE_API_BASE_URL` as a direct member expression (not only via a `meta` variable).

## Alternatives considered

| Option | Why not |
|--------|---------|
| Runtime fetch of `/config.json` | Extra request; CI already bakes env |
| Hardcode production host in source | Breaks local proxy / staging |
| Pages `_redirects` proxy `/api/*` → Workers | Possible defense-in-depth later; does not fix wrong absolute URLs if any |

## Scope

- `frontend/src/api/client.ts`
- `frontend/src/api/client.base-url.test.ts` (new)
- Bug docs status → Resolved after ship

No backend change. Redeploy Pages after merge so the new bundle ships.

## Rollback

Revert `client.ts` (and test).

## Risks

Low. Matches existing pattern in `chat.ts` / `ImageUploader.ts`.

## Regression plan

1. Fail-first source test for direct `import.meta.env.VITE_API_BASE_URL` in `client.ts`.
2. After Pages deploy: Network tab shows `POST https://api.lardermind.com/api/auth/guest` → 200; landing guest chat mints.
3. Local: empty env still proxies via Vite.
