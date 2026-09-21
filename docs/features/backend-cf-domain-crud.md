# Feature: Cloudflare domain CRUD parity (`backend-cf/`)

**Status:** Implemented  
**Scope:** Nest-shaped CRUD for preferences, shopping-list, folders, ingredients, recipes, meal-plans (+ confirm/skip); small chat/upload compatibility fixes  
**Out of scope:** Stripe checkout, IAP validate/sync, LangGraph HITL (`chat/send`/`resume` stay 501), chat tool-calling cards

**Already on CF (not part of this feature):** auth, chat stream/sessions, pantry CRUD, pantry-vision, R2 upload/media, subscription plans/status stubs

---

## 1. Summary

After Nest removal, mobile/web still call domain APIs that 404 on Workers. Pantry + vision are done; this feature restores the remaining **client-called Nest CRUD** domains so Inventory-adjacent screens (shopping, recipes, calendar, settings) work against CF.

### Locked decisions

| Decision | Choice |
|----------|--------|
| Contract | Nest paths + `{ success, message, data? }` |
| Auth | JWT on all new routes |
| Ownership | Always `user_id` scoped (ingredients per-user catalog) |
| Preferences arrays | JSON TEXT columns on `user_preferences` |
| Recipe instructions | Store TEXT; accept string or string[]; return string[] |
| Meal confirm | Deduct pantry by `ingredient_id` else name (CI); **set** qty; report shortages |
| Upload | Accept multipart field `file` **or** `image`; response includes `imageUrl`/`image_url`, `publicId`/`public_id` |
| Billing / HITL | Explicitly deferred |

---

## 2. Endpoints to add

| Domain | Methods |
|--------|---------|
| `user-preferences` | GET, PUT |
| `shopping-list` | GET list/get, POST, PUT, DELETE |
| `folder` | GET list/get, POST, PUT, DELETE |
| `ingredient` | GET list/get, POST, PUT, DELETE |
| `recipe` | GET list/get, POST, PUT, DELETE |
| `meal-plan` | GET list/get/pending-confirm, POST, PUT, DELETE, POST confirm/skip |
| `chat/history` | DELETE (clear by sessionId) |
| `chat/actions` | GET stub `{ actions: [], description }` |
| `upload/image` | Accept `image` field alias + dual response keys |

---

## 3. Success criteria

- [x] All listed routes mounted + JWT (except public media)
- [x] Vitest covers create/list for each domain + meal confirm deduct
- [x] Upload accepts `image` field
- [x] README updated
- [ ] Manual smoke against deployed Worker (post migrate + deploy)

---

## 4. References

- Design: `docs/design/backend-cf-domain-crud-design.md`
- Tasks: `tasks/backend-cf-domain-crud/`
- Prior: `backend-cf-pantry-crud`, `backend-cf-ai-gateway`
