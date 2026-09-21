# Design: Cloudflare domain CRUD parity

**Feature:** `docs/features/backend-cf-domain-crud.md`

---

## 1. Schema (`migrations/0004_domain_crud.sql`)

- Alter `user_preferences`: `allergies_json`, `dislikes_json`, `likes_json`, `dietary_restrictions_json` TEXT default `'[]'`
- Tables: `folders`, `ingredients`, `recipes`, `recipe_ingredients`, `shopping_list_items`, `meal_plans` (columns per feature; all user-scoped FKs)

Indexes: `(user_id)` on each user table; `(recipe_id)` on `recipe_ingredients`; `(user_id, status)` on `meal_plans`.

---

## 2. Modules

| Route file | DB file |
|------------|---------|
| `routes/preferences.ts` | `db/preferences.ts` |
| `routes/shopping-list.ts` | `db/shopping-list.ts` |
| `routes/folder.ts` | `db/folder.ts` |
| `routes/ingredient.ts` | `db/ingredient.ts` |
| `routes/recipe.ts` | `db/recipe.ts` |
| `routes/meal-plan.ts` | `db/meal-plan.ts` |

Register `/bulk` and `/pending-confirm` and `/:id/confirm` **before** bare `/:id` where applicable.

Shared: dual flat/`details` coalesce for shopping (same pattern as pantry).

### Preferences DTO

```ts
{
  id, allergies, dislikes, likes, dietaryRestrictions,
  householdNotes, measurementUnit, notes
}
```

GET creates empty row if missing. PUT upserts. Response may wrap as `{ preferences: dto }` **and** clients also accept bare dto — return bare dto (unwrap handles both).

### Recipe DTO

Match client `Recipe`: `id`, `folder_id`, `meal_name`, `instructions: string[]`, `ingredients[]`, `image: { url, public_id } | null`.  
Also accept create with `image_url` / `instructions` string.

### Meal confirm

1. Load plan + recipe ingredients  
2. For each ingredient: find pantry by `ingredient_id` then name CI  
3. If found: deduct `min(available, needed)`; if short, push shortage  
4. Set status `CONFIRMED`  
5. Return `{ mealPlan, shortages, deducted, alreadyConfirmed }`  
Skip → `SKIPPED`. Idempotent confirm if already `CONFIRMED`.

---

## 3. Chat / upload patches

- `DELETE /api/chat/history?sessionId=` → delete messages for owned session  
- `GET /api/chat/actions` → `{ actions: [], description: 'Tool actions not available on CF API v1' }`  
- Upload: `file = body.file || body.image`; ok payload dual keys

---

## 4. Tests

`src/routes/domain-crud.test.ts` (+ small upload/chat assertions): auth 401, CRUD happy path, meal confirm deducts, upload `image` field.

---

## 5. Rollback

Unmount new routes; leave additive tables.
