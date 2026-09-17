# Feature: Pantry Image Recognition (Mobile)

**Status:** Implemented — see [pantry-image-recognition-design.md](../design/pantry-image-recognition-design.md)  


**Scope:** Mobile app (`mobile/`) + Nest backend (`backend-node/`) — photo capture/pick → OpenAI gpt-4o vision → confirm/edit draft → write pantry (Inventory)  
**Out of scope:** Web UI, Spring backend, multimodal DeepSeek chat, auto-apply without confirm, offline recognition, recognition history DB

---

## 1. Summary

Let users add groceries to **pantry inventory** by photographing (or picking) food images. The backend uses **OpenAI gpt-4o** vision to propose ingredient **category/type**, **name**, and **approximate quantity + unit**. The user **reviews and edits** the draft list, then confirms; only then does the app write to pantry.

Text chat remains on **DeepSeek**. Vision is a **separate** OpenAI path — Chat attach opens the same recognition → confirm flow and does **not** send the image through the DeepSeek agent.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | **Mobile only** | Primary capture context; web deferred |
| Entry points | **Pantry screen + Chat attach** (A + B) | Restock from inventory UI and from assistant |
| Write path | **Confirm / edit draft first**, then pantry write | Avoid bad AI guesses silently corrupting inventory |
| Vision model | **OpenAI gpt-4o** | User-specified; best multimodal fit |
| Text chat model | **DeepSeek** (unchanged) | Keep cost/provider split; no multimodal DeepSeek in v1 |
| Inventory | Existing Nest **pantry** (`/api/pantry-item`) | Product “Inventory” = pantry items |
| Backend | **Nest only** (`backend-node/`) | Current production path |
| Shared UX | One review flow for both entries | Consistent confirm UX; less duplicate UI |
| Confirm merge | **Upsert by ingredient** — if same ingredient exists, **add** quantity; else create | Natural “restock from photo” behavior |

### What changes

| Area | Before | After |
|------|--------|-------|
| Pantry | Manual add / search only | Camera / gallery → AI draft → confirm → pantry |
| Chat | Text-only send | Attach image → same recognition + confirm flow (not DeepSeek tools) |
| Backend | Cloudinary upload hosting only; chat = DeepSeek text | New vision recognize API (gpt-4o) + existing pantry write APIs |
| Quota | `image_uploads` for Cloudinary | Recognition attempts counted under product image/vision quota policy (design locks exact counter) |

---

## 2. Current system

### 2.1 Nest pantry API (unchanged contract for writes)

JWT-protected pantry CRUD in `backend-node/src/pantry-items/`:

| Method | Path | Notes |
|--------|------|-------|
| `GET` | `/api/pantry-item` | List items |
| `GET` | `/api/pantry-item/:id` | Single item |
| `POST` | `/api/pantry-item` | Create (`name` or `ingredient_id`, `quantity`, `unit`, optional `notes` / nested `details`) |
| `POST` | `/api/pantry-item/bulk` | Bulk create |
| `PUT` | `/api/pantry-item/bulk` | Bulk upsert-by-ingredient (sets quantity; does not add) |
| `PUT` | `/api/pantry-item/:id` | Update |
| `DELETE` | `/api/pantry-item/:id` | Delete |

Logical item fields: `id`, `name`, `ingredient_id`, `quantity`, `unit`, `notes`, unit metadata, timestamps.

Ingredient catalog (`ingredients`) has `name`, units, optional `imageUrl` — **no category column**. Chat tools (`CookingToolsService.addPantryItems`) already merge duplicates when adding by name; confirm-write should match that **add-quantity-if-exists** semantics (exact endpoint/helper chosen in design).

### 2.2 Upload & quota today

| Piece | Role |
|-------|------|
| `POST /api/upload/image` | Multipart → Cloudinary; returns `imageUrl` / `publicId` |
| `UsageQuotaService.checkAndIncrementImageUpload` | Free: 10 / month; Pro: unlimited (`image_uploads`) |
| Allowed MIME | jpeg, png, webp, gif; max 8MB |

Upload is **hosting only** — no vision / inventory side effects.

### 2.3 Chat today

| Piece | Role |
|-------|------|
| `cooking-agent-graph.service.ts` | DeepSeek via OpenAI-compatible `ChatOpenAI` + `DEEPSEEK_API_KEY` / `LLM_*` |
| Chat DTO | `message: string` (+ session / recipe context) — **no image** |
| `CookingToolsService` | Text tools can list/add/update/remove pantry |
| Mobile `AICookingAssistantScreen.tsx` | Text input + send only |

### 2.4 Mobile today

| File | Role |
|------|------|
| `mobile/src/screens/PantryInventoryScreen.tsx` | Search, manual add, FlashList rows |
| `mobile/src/contexts/pantryContext.tsx` | Pantry fetch / add / update / remove |
| `mobile/src/api/pantryItem.ts` | REST client + DTO parse |
| `mobile/src/screens/AICookingAssistantScreen.tsx` | Text chat UI |
| `mobile/src/screens/RecipeManagerScreen.tsx` | Existing `expo-image-picker` camera + gallery (local URI; recipe photos) |

There is **no** pantry vision API, chat attach control, or shared “recognized items review” screen.

---

## 3. Requirements

### 3.1 Entry: Pantry inventory

- From `PantryInventoryScreen`, user can start recognition via **camera** and/or **photo library** (reuse `expo-image-picker` patterns from Recipe Manager).
- Request camera / library permissions with clear denial messaging.
- While recognizing: non-blocking loading state; user can cancel/dismiss where safe (design: whether in-flight request is aborted).
- On success: navigate/present the **shared review** UI with draft items + optional thumbnail of the source image.
- On failure: actionable error (quota, network, unsupported image, empty recognition); pantry list unchanged.

### 3.2 Entry: Chat attach

- On `AICookingAssistantScreen`, add an **attach / camera** control next to the composer.
- Choosing an image starts the **same** recognition → review → confirm pipeline as Pantry.
- The image is **not** sent as a DeepSeek chat message and does **not** invoke LangGraph tools for recognition.
- After successful confirm, pantry is updated; optional lightweight chat feedback (e.g. “Added N items to pantry”) is allowed but must not require a DeepSeek round-trip for the recognition itself.
- Discarding the review must not write pantry and must not leave a half-applied chat side effect.

### 3.3 Recognition (backend + OpenAI)

- New Nest endpoint (path finalized in design) accepts an authenticated user’s image (multipart and/or already-hosted URL — design picks one primary path).
- Backend calls **OpenAI gpt-4o** vision with a structured output / JSON schema.
- Each draft item MUST include:
  - **category / type** (e.g. produce, dairy, meat, pantry staple) — advisory for UX; ingredient table has no category field today
  - **name / 品項** (human-readable ingredient name suitable for catalog resolve/create)
  - **approximate quantity** + **unit** (prefer mass when estimable; else count/volume with honest uncertainty)
- Response returns an ordered draft list; confidence or “uncertain” flags are nice-to-have for UX, not required for v1 write.
- Empty / non-food images → empty draft or explicit “nothing recognized” message; **no** pantry write.
- Require JWT. Enforce size/MIME limits consistent with upload policy (≤ 8MB; jpeg/png/webp; gif optional for vision).
- Require `OPENAI_API_KEY` (new env). Misconfiguration → clear 5xx/503 without leaking secrets.
- Do **not** use `DEEPSEEK_API_KEY` for this path.

### 3.4 Confirm / edit UX (shared)

Shared review surface used by both entries:

| Capability | Required |
|------------|----------|
| See all proposed items | Yes |
| Edit name | Yes |
| Edit quantity | Yes |
| Edit unit | Yes |
| Edit / view category | Yes (display; may map to notes or UI-only if not persisted) |
| Remove a line | Yes |
| Add a blank line (optional) | Nice-to-have |
| Confirm → write pantry | Yes |
| Cancel / discard → no write | Yes |

- Confirm is disabled while recognition is in flight or draft is empty.
- After confirm success: refresh pantry context / list; close review; show brief success.
- Partial write failure: show which items failed; do not claim full success.

### 3.5 Pantry write on confirm

- On confirm, write **only** user-approved draft rows (post-edit).
- Semantics: **upsert by ingredient identity** (resolved name / ingredient_id):
  - Existing pantry row for same ingredient → **add** confirmed quantity (unit-normalized where existing converters allow; else design specifies fallback).
  - No existing row → create.
- Prefer reusing existing pantry service helpers / chat merge behavior over inventing a divergent write model.
- Client may call one dedicated “apply recognition” API **or** compose existing pantry APIs — design chooses; product behavior above is mandatory either way.
- Do not delete unrelated pantry items as part of recognition.

### 3.6 Quota, auth, lifecycle

- Recognition requires logged-in user (existing JWT).
- Count recognition toward entitlements so free tier cannot unboundedly call gpt-4o (design: reuse `image_uploads`, extend it, or add a dedicated counter — must be explicit and enforced server-side **before** calling OpenAI).
- Quota exceeded → 4xx with upgrade messaging; no OpenAI call.
- Logout: discard any in-memory draft; no cross-user draft leak.
- Do not persist drafts across users; durable draft cache is out of scope for v1 unless design finds a strong need.

### 3.7 i18n & product copy

- User-facing strings (buttons, errors, empty recognition, confirm) go through existing mobile i18n patterns.
- Prefer clear cooking-inventory language (“Add to pantry” / Inventory) consistent with current screens.

---

## 4. Edge cases

| Case | Expected behavior |
|------|-------------------|
| Permission denied (camera/library) | Explain + link to settings; no crash |
| User cancels picker | No-op |
| Non-food / blank / blurry image | Empty or low-value draft; message; no auto-write |
| Multiple items in one photo | Return multiple draft rows |
| Duplicate names in one draft | Allow edit; on confirm merge per upsert rules (design: merge draft lines vs write twice) |
| Ingredient name not in catalog | Create/resolve ingredient by name (existing pantry create path) |
| Unit mismatch with existing pantry row | Convert if supported; else keep user-edited unit / show warning (design) |
| User removes all draft lines then confirms | No-op or disable confirm |
| Network fail during recognize | Error; pantry unchanged |
| Network fail during confirm write | Error; show retry; pantry may be partial — surface clearly |
| Quota exceeded | Block before OpenAI; friendly upgrade copy |
| OpenAI timeout / 5xx | Error; no pantry write; do not increment success-only counters incorrectly (design) |
| Chat attach then discard | No pantry change; chat history unchanged (or no stuck “pending” message) |
| Rapid double-tap confirm | Single write (idempotent client guard / server-safe) |
| Image > 8MB / bad MIME | Reject client-side and/or server-side |
| Offline | Fail gracefully; no offline queue for vision in v1 |

---

## 5. Security issues

| Risk | Mitigation |
|------|------------|
| OpenAI key exposure | Key only on Nest server; never in mobile env |
| Arbitrary image → prompt injection | Treat model output as untrusted structured data; validate schema; never execute model text as code; pantry write only from confirmed validated fields |
| Oversized / malicious uploads | MIME + size limits; authenticated endpoint |
| Cross-user pantry write | JWT `userId` on all pantry ops (existing) |
| Quota bypass | Enforce quota server-side before vision call |
| Logging PII / images | Do not log raw image bytes or full base64 in production logs; avoid storing photos longer than needed for the request |
| Cloudinary vs ephemeral | If design uses base64-only to OpenAI, prefer not retaining image; if Cloudinary used, scope to user and existing delete rules |

---

## 6. UX issues

| Issue | Approach |
|-------|----------|
| AI weight guesses feel wrong | Always editable quantity/unit before write; copy that values are approximate |
| User expects Chat to “talk about” the photo | v1 is inventory intake, not multimodal Q&A; keep attach labeled for pantry add if needed |
| Two entry points diverge | Shared review component/screen |
| Long recognition latency | Clear loading; allow cancel/dismiss; avoid freezing the whole app |
| Category not in DB | Show category in review; persistence strategy in design (notes vs UI-only) |
| Success unclear | Toast / banner + pantry list refresh |

---

## 7. Performance issues

| Issue | Approach |
|-------|----------|
| gpt-4o cost / latency | Compress/resize on device before upload (design: max dimension); one image per request in v1 |
| Large payloads | Prefer compressed JPEG; enforce 8MB cap |
| Blocking UI thread | Async upload/recognize; keep list scrollable underneath where possible |
| Confirm writing many items | Batch / bulk API; bound max draft items (e.g. 20–30) from model + UI |
| Double quota charge | Single recognition = one quota increment policy documented in design |

---

## 8. Acceptance criteria

- [ ] From Pantry, user can capture or pick a photo and receive a draft ingredient list (category, name, qty, unit).
- [ ] From Chat, user can attach/capture a photo and enter the **same** review flow (image not sent to DeepSeek).
- [ ] User can edit and remove draft lines; Cancel writes nothing.
- [ ] Confirm writes to pantry with upsert-add semantics; pantry UI refreshes.
- [ ] Vision uses OpenAI gpt-4o; text chat still uses DeepSeek.
- [ ] Unauthenticated / quota-exceeded / invalid image paths fail safely without pantry mutation.
- [ ] Permissions denial and network/OpenAI failures show recoverable errors.
- [ ] Unit tests cover DTO/schema validation and merge/upsert behavior; mobile tests cover review edit → confirm payload shaping where practical.
- [ ] No web or Spring work required for this version.

---

## 9. Related files

| Path | Relevance |
|------|-----------|
| `mobile/src/screens/PantryInventoryScreen.tsx` | Entry A |
| `mobile/src/screens/AICookingAssistantScreen.tsx` | Entry B (attach) |
| `mobile/src/screens/RecipeManagerScreen.tsx` | Image picker reference |
| `mobile/src/contexts/pantryContext.tsx` | Pantry state refresh after confirm |
| `mobile/src/api/pantryItem.ts` | Existing write client |
| `backend-node/src/pantry-items/*` | Inventory write |
| `backend-node/src/upload/*` | Upload limits / Cloudinary (optional path) |
| `backend-node/src/usage-quota/*` | Quota enforcement |
| `backend-node/src/chat/graph/cooking-agent-graph.service.ts` | DeepSeek chat — **unchanged** for vision |
| `backend-node/src/chat/cooking-tools.service.ts` | Existing pantry merge semantics reference |
| `backend-node/.env.example` | Add `OPENAI_API_KEY` (+ model override if any) |

---

## 10. Open items for design phase

Resolved in [`docs/design/pantry-image-recognition-design.md`](../design/pantry-image-recognition-design.md):

1. Recognize = multipart → Nest → OpenAI base64 (no Cloudinary).
2. Confirm = `POST /api/pantry-vision/apply` merge-add.
3. Same unit-kind → convert then add; else raw add fallback.
4. Category = UI-only (not persisted).
5. Quota = reuse `image_uploads` before OpenAI.
6. Max 25 items; client resize 1280px; timeout 60s; model gpt-4o.
7. Hidden Drawer screen `PantryImageReview`; chat success = toast / optional local bubble.
8. Images ephemeral (not retained in Cloudinary).

---

## 11. Non-goals (this version)

- Web or desktop image recognition UI
- Spring (`backend/`) implementation
- Sending images through DeepSeek / LangGraph as multimodal chat
- Auto-writing pantry without user confirm
- Offline queue for recognition or confirm
- First-class DB table for recognition sessions/history
- Barcode / receipt OCR as a separate product mode
- Replacing manual pantry add or chat text tools
