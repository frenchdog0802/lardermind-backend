# RCA: Web API base URL indirect env

**Bug:** [web-api-base-url-indirect-env.md](../bugs/web-api-base-url-indirect-env.md)

## Root cause

Vite only **statically replaces** direct references of the form `import.meta.env.VITE_*` at build time.

`frontend/src/api/client.ts` reads the API base through an indirection:

```ts
const meta = import.meta as …;
const value = meta.env?.VITE_API_BASE_URL;
```

That pattern is **not** replaced. In the production bundle, `readApiBaseUrl()` resolves to `""`, so `fetch(\`${BASE_URL}${path}\`)` hits the Pages origin. Pages has no Worker routes → `POST /api/auth/guest` returns **405** → non-JSON body → `client.ts` throws → GuestChatBox shows mint failed.

## Evidence

| Check | Result |
|-------|--------|
| `POST https://api.lardermind.com/api/auth/guest` | 200 + token |
| `POST https://lardermind.com/api/auth/guest` | 405 |
| Prod bundle `chat.ts` / upload / Google button | Inlined `"https://api.lardermind.com"` |
| Prod bundle `client.ts` (`yE=gE()`) | Runtime `import.meta.env.VITE_API_BASE_URL` → empty |

## Contributing factors

1. `client.ts` was refactored to a helper that broke Vite’s static replace contract.
2. `chat.ts` / `ImageUploader.ts` kept direct access, masking total outage (stream still worked).
3. Local Vite proxy makes empty `VITE_API_BASE_URL` look fine in dev.

## Affected components

- All callers of `api` from `client.ts` (auth including guest mint, most CRUD).
- Landing `GuestChatBox` (most visible symptom).

## Timeline

Introduced when `readApiBaseUrl()` used optional-chaining via a local `meta` variable (landing polish / guest commit path around client FormData changes).

## Why not caught earlier

Local `VITE_API_BASE_URL=` + Vite proxy hides the bug. Partial prod traffic can succeed via `chat.ts`’s separate client.
