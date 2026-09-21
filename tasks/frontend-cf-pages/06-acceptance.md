# Task 06: Acceptance sign-off

## Goal

Confirm the Pages hosting slice is ready for operator activate.

## Acceptance

- [ ] Tasks 01–05 complete
- [ ] Checklist + progress updated
- [ ] Feature doc status reflects “Implemented — set secrets to activate” (or equivalent)
- [ ] No Nest primary-path leftovers in the touched README / wrangler comments

## Operator smoke (manual, not blocking code merge)

1. Set frontend GitHub secrets/vars.
2. Push or re-run workflow → Pages URL live.
3. Add Pages origin to Worker CORS.
4. Open Pages URL; `GET /api/health` via browser network succeeds (CORS OK).
