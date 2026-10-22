# 02 — Validation, observability, CI

**Status:** done

## Work

- Zod schemas for auth, chat resume/send, shopping-list bodies
- `GET /api/openapi.json` built from those schemas
- Error-code catalog, JSON request log, `X-Request-Id`
- Workflow job `check` (`typecheck` + `test`) before migrate and deploy

## Acceptance

- Invalid resume/auth JSON is 400 `validation_error`
- OpenAPI paths include `/api/chat/resume` and `/api/shopping-list`
- Health response carries `X-Request-Id`; the log line is JSON with that id
- Unknown route error body includes `code` and `requestId`
- `migrate` and `deploy` `needs: check` (deploy needs migrate)
