# Launch hardening (backend), 2026-11

Branch `feat/launch-hardening`. All API changes are backward compatible: existing request and
response shapes are unchanged, every new parameter is optional, and defaults keep today's behaviour.

## OWNER ACTION BEFORE RELEASING THE APP

Apply the two new migrations to **staging, then prod** D1 before deploying this Worker or
releasing the iOS build that calls `DELETE /api/auth/account`:

- `backend-cf/migrations/0013_user_soft_delete.sql`  (adds `users.deleted_at`, `deleted_email`, `deleted_google_id`)
- `backend-cf/migrations/0014_perf_indexes.sql`      (idempotent `CREATE INDEX IF NOT EXISTS`)

`npm run db:migrate:staging`, then `npm run db:migrate:remote`. The new Worker reads
`users.deleted_at` on every authenticated request, so deploying it before 0013 breaks all auth.
Migrations are additive and safe for the previous Worker.

## API additions

- `DELETE /api/auth/account` (Bearer auth, guests included). Soft delete. Success:
  `200 { "success": true, "message": "Account deleted", "data": null }`. Afterwards the token is
  rejected with 401 (`Invalid token`), signin/google-login/password-reset/guest-claim treat the
  account as nonexistent, the email and Google id are freed (email becomes
  `deleted-<id>@deleted.lardermind.local`, originals kept in `deleted_email` / `deleted_google_id`),
  password hash cleared, outstanding reset tokens burned. Data rows are kept (not hard-deleted).
- `GET /api/recipe?limit=&cursor=` (cursor = numeric offset; limit max 200). Absent = everything.
- `GET /api/meal-plan?from=&to=` (YYYY-MM-DD, inclusive). Absent = everything.
- `GET /api/chat/history?sessionId=&limit=&before=` (before = id of the oldest message already
  loaded; returns the newest `limit` messages oldest-first plus `hasMore`, `nextBefore`).
- `GET /api/chat/sessions?limit=&before=` (before = id of the last session of the previous page;
  adds `hasMore`, `nextBefore`). Without `limit`/`before` the bodies are exactly as before.

## Performance / atomicity

- Recipe create/update: one `db.batch` (row + ingredients; update = DELETE + inserts), DTO built in memory.
- Recipe list: one grouped, chunked (90 params) ingredient query instead of N+1.
- Meal plan: availability / soft-reserve load recipes once + one grouped ingredient query, date
  range in SQL. `confirmMealPlan` loads the pantry once, matches in memory, one batch for all
  deductions plus the status flip (now atomic).
- Shopping sync/unsync: prefetch shopping + pantry rows with IN queries, decide in memory, single
  `db.batch`. `findUncheckedByNameUnitCi` is a targeted `LIMIT 1` query.
- Folders: `ensureDefaultFolders` inserts only missing defaults in one batch, no second list.
- Chat history: session row reused for the pending interrupt, reads in `Promise.all`.
- Indexes: `meal_plans(user_id, serving_date)`, `recipes(folder_id)`, NOCASE name indexes on
  `pantry_items` and `shopping_list_items`; lookups now use `name = ? COLLATE NOCASE`.

## Notes / not changed

- `requireAuth` loads the user row, and `pantry-vision`, `subscription`, `upload` and the agent loop
  load it again (one redundant point query per request). Left alone to avoid touching security
  behaviour; the middleware could stash the row on the context later.
- Shopping merge-add now matches `name = ? COLLATE NOCASE` (no TRIM on the stored side); names are
  trimmed on input so this only differs for legacy untrimmed names.
- Single-row shopping update/create still re-select after write (kept for the fake-DB test harness).
- Stripe subscription state of a soft-deleted user is not touched; cancel in Stripe separately.
- Tests: new real-SQL tests (`src/db/launch-hardening.sqlite.test.ts`, `src/routes/chat-paging.test.ts`)
  use `node:sqlite` via `src/test-utils/sqlite-d1.ts` and run the real migrations.
