# Feature: Cloudflare R2 image upload (`backend-cf/`)

**Status:** Implemented (`backend-cf/` upload / delete / media + D1 quota)  
**Scope:** Add **R2** object storage for user images on the CF stack; **D1** remains the sole SQL store for metadata / quotas / auth  
**Out of scope:** Nest/Postgres changes, Cloudinary bulk asset migration, recipe/pantry CRUD on Workers, Vectorize, signed/private media, Pages deploy

---

## 1. Summary

LarderMind’s CF path already uses **D1** for relational data. This feature adds **R2** for binary images (recipe photos, avatars, etc.) so media does not live in D1 or a third-party CDN like Cloudinary.

Upload/delete happen through the existing Worker (`lardermind-api`); clients keep a Nest-shaped HTTP contract where practical.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | **D1 only** (unchanged) | User confirmed; no new SQL product |
| Images / blobs | **R2** | User confirmed; CF-native; replaces Cloudinary on CF path |
| Host project | **`backend-cf/`** only | Parallel CF API already owns D1 + Workers |
| API shape | Nest-compatible `POST/DELETE /api/upload/image` | Same envelope + fields clients expect |
| Object id | R2 object **key** = `publicId` | Drop Cloudinary naming; one id for delete |
| Public read (v1) | **Worker GET** `/api/media/*` streams from R2 | No custom domain / public-bucket setup required for v1 |
| Quota | Reuse product metaphor **`image_uploads`** on D1 `usage_quotas` | Free: 10 / calendar month; Pro: unlimited (stub Pro = role/plan later) |
| Clients this feature | **API + docs only** | No `ImageUploader` in current `frontend/` / `mobile/`; wire in a follow-up when recipe UI needs it |
| Nest / Cloudinary history | **Out of scope** | This workspace has no Nest upload module; no production Cloudinary dump to migrate |

### What changes

| Area | Before | After |
|------|--------|-------|
| Media on CF | Not implemented (R2 commented in `wrangler.toml`) | Upload → R2; read via Worker; delete by key |
| Quota schema | `usage_quotas` has AI counters only | + `image_uploads` (+ period start if needed) |
| Contract | Upload listed as “Not yet” in README | Documented + implemented Nest-shaped routes |

---

## 2. Requirements

### 2.1 Upload

- `POST /api/upload/image` (JWT required).
- Multipart field name: `file` (or `image` — design locks one).
- Allowed MIME: `image/jpeg`, `image/png`, `image/webp`, `image/gif`.
- Max size: **8 MB**.
- On success: `{ success, message, data: { imageUrl, publicId } }` where `publicId` is the R2 key and `imageUrl` is an absolute URL clients can `<img src>` (Worker media route under the same API origin).
- Increment `image_uploads` **before** writing to R2 (abuse control; same pattern as Nest/vision docs).
- Over quota → **403** with clear message; no R2 write.

### 2.2 Delete

- `DELETE /api/upload/image/:publicId` (JWT required).
- `publicId` is URL-safe encoding of the R2 key (or path segments — design locks encoding).
- Only the **owning user** may delete (key prefix includes `userId`).
- Missing object → idempotent success or 404 (design locks one).
- Does **not** decrement monthly quota (uploads spent stay spent).

### 2.3 Read

- `GET /api/media/*` (public, no JWT) streams the object with correct `Content-Type` and cache headers.
- Unknown key → 404.
- Path traversal / key escaping must not allow reading another user’s objects via `../` tricks (keys are opaque, not filesystem paths).

### 2.4 Ops

- Create R2 bucket `lardermind-media` (name locked in design if different).
- Bind as `R2` in `wrangler.toml`.
- Document local (`wrangler dev`) + remote create/deploy in `backend-cf/README.md`.
- CI: existing Workers deploy must keep working; R2 binding present so deploy does not fail.

---

## 3. Non-goals

- Migrating historical Cloudinary URLs or dumping Cloudinary assets into R2.
- Changing Nest / Postgres / Railway.
- Building recipe/pantry CRUD that *stores* `imageUrl` in D1 (schema may already anticipate fields; this feature only provides upload plumbing).
- Private / signed URLs, image transforms (resize/AVIF), Cloudflare Images product.
- Wiring `frontend/` or `mobile/` pickers (follow-up feature).

---

## 4. Edge / security / UX / performance

| Area | Concern | Requirement |
|------|---------|-------------|
| Security | Cross-user delete | Object key must be namespaced by authenticated `user_id` |
| Security | Oversized / weird MIME | Reject before R2 put; do not trust client-only checks |
| Security | Public media GET | Acceptable for recipe photos; no secrets in object keys |
| Quota | Free-tier abuse | Hard cap 10/month server-side |
| Perf | Large body on Worker | Cap 8 MB; fail fast |
| UX | Clients | Stable `imageUrl` under API base URL so cutover is env-only |
| Ops | Local vs remote | Same routes work with local R2 simulation |

---

## 5. Success criteria

- [x] R2 bucket bound; `wrangler.toml` no longer comments out media binding
- [x] Authenticated upload stores bytes in R2 and returns `imageUrl` + `publicId`
- [x] `GET imageUrl` returns the image bytes
- [x] Owner can delete; other users cannot
- [x] Free user blocked after 10 uploads in period
- [x] README documents bucket create + binding + routes
- [x] Automated tests cover happy path + reject oversized / wrong MIME / over quota (as far as Worker test harness allows)

---

## 6. References

- Target map: [cloudflare-target.md](../architecture/cloudflare-target.md)
- Parent API: [backend-cf-api.md](./backend-cf-api.md)
- Design: [backend-cf-r2-upload-design.md](../design/backend-cf-r2-upload-design.md)
- Tasks: [tasks/backend-cf-r2-upload/README.md](../../tasks/backend-cf-r2-upload/README.md)
