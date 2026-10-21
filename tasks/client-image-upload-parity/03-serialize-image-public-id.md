# Task 03: serializeRecipePayload `image_public_id`

**Acceptance**

- [ ] When `recipe.image?.url` set, payload includes `image_url` and `image_public_id` (may be empty string if missing)
- [ ] When image cleared (`null`), payload clears both fields consistently for create/update callers
- [ ] Any duplicate serialize in pantryContext aligned
- [ ] Unit test updated
