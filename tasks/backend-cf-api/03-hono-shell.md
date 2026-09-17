# Task 03: Hono app shell

**Phase:** 1 — Scaffold  
**Depends on:** 01  
**Blocks:** 04–07

## Description

Hono entry with CORS middleware, `GET /api/health`, global JSON error shape matching Nest `ok()`.

## Files

| Action | Path |
|--------|------|
| Create | `backend-cf/src/index.ts` |
| Create | `backend-cf/src/env.ts` |
| Create | `backend-cf/src/lib/api-response.ts` |
| Create | `backend-cf/src/middleware/cors.ts` |
| Create | `backend-cf/src/routes/health.ts` |

## Acceptance criteria

- [ ] `GET /api/health` → `{ success, message, data: { status:'UP', timestamp } }`
