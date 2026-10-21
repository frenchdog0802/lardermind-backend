# Feature: Client image upload parity (recipe R2 + chat pantry vision)

**Status:** Implemented (manual E2E against staging recommended)  
**Scope:** Align **web** (`frontend/`) and **mobile** (`mobile/`) on two existing `backend-cf` contracts — recipe photos via R2 upload, chat attach via pantry vision  
**Out of scope:** Multimodal chat (image in agent turn), backend contract changes, Cloudinary, guest upload/vision, Android-only polish beyond shared RN code

---

## 1. Summary

Backend already supports:

- `POST/DELETE /api/upload/image` + `GET /api/media/*` (R2)
- `POST /api/pantry-vision/recognize` + `apply` (vision → pantry)

Clients are uneven: web recipes upload to R2; mobile recipes still persist `file://` URIs. Mobile chat attach runs pantry vision; web chat is text-only.

This feature makes **both platforms** use the **same two flows**.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Chat image meaning | **Pantry vision only** | User confirmed (option A); not DeepSeek multimodal |
| Platforms | **Web + Mobile** | User confirmed; same contracts |
| Recipe storage | **R2 via `/api/upload/image`** | Existing CF feature; portable URLs |
| Vision storage | **No R2 required** | Recognize streams bytes to vision; matches pantry-image-recognition design |
| Entry points (vision) | **Chat attach + Pantry inventory** | Match mobile dual entry |
| Backend | **No new routes** | Reuse `backend-cf` upload + pantry-vision |

### What changes

| Area | Before | After |
|------|--------|-------|
| Mobile recipe image | Local `file://` in D1 `image_url` | Upload → R2 → save `image_url` + `image_public_id` |
| Web chat | Text-only composer | Attach → recognize → review → apply |
| Web pantry | Manual add only (no photo) | Camera/gallery → same review flow |
| Web recipe | Already uploads | Minor polish (stale Cloudinary comment) |

---

## 2. Requirements

### 2.1 Recipe → R2 (both platforms)

- Pick / compress image → `POST /api/upload/image` with multipart field `image` (or `file`).
- On success, set recipe form `image: { url, public_id }` from response (`image_url` / `public_id`).
- Persist via nested `image` or flat `image_url` + `image_public_id`.
- Never persist device-local URIs (`file://`, `content://`, blob-only without upload).
- On replace/remove: `DELETE /api/upload/image/:publicId` when prior `public_id` is non-empty.
- Upload failure: show error; keep previous image; do not save local URI as fallback.
- Guests / over quota (403): surface API message.

### 2.2 Chat / pantry vision (both platforms)

- Multipart field `image` → `POST /api/pantry-vision/recognize`.
- User reviews/edits draft → `POST /api/pantry-vision/apply`.
- Image **does not** enter `/api/chat` or the agent loop.
- Shared review UX: editable rows (name, qty, unit, category), remove row, confirm/cancel.
- Entry points: chat attach control + pantry inventory photo control.
- Empty recognition: show empty state / message; allow cancel.
- Quota / guest errors: surface clearly.

### 2.3 Shared contract

| Layer | Names |
|-------|--------|
| Upload multipart | `file` or `image` |
| Upload response | `image_url` + `public_id` (camelCase also present) |
| Recipe write | nested `image` or flat `image_url` / `image_public_id` |
| Vision multipart | `image` only |
| Chat payload | text `message` only (unchanged) |

---

## 3. Non-goals

- Sending images through DeepSeek / agent tools.
- Changing R2 or pantry-vision Worker APIs.
- Migrating historical local URIs already in D1.
- Private/signed media URLs.

---

## 4. Edge cases

| Case | Expected |
|------|----------|
| Free user 11th upload or recognize | 403; no silent skip |
| Upload succeeds, recipe save fails | Image remains in R2 (acceptable v1); user can retry save |
| Remove image with empty `public_id` | Clear local form fields only; skip DELETE |
| Vision returns 0 items | Review UI with empty message |
| Oversized / bad MIME | 400/413 from API; client toast/alert |
| Guest user | Blocked by backend; client shows auth/upgrade message if hit |

---

## 5. Acceptance

- Mobile: pick recipe photo → media URL loads after save (not `file://`); remove deletes R2 when `public_id` set.
- Web: chat attach and pantry photo → review → pantry items updated.
- Both platforms use the same API field names and flows above.
- Unit tests cover mobile serialize `image_public_id` and web vision FormData field `image`.
