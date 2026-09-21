# Fix Design: Mobile pantry photo pick lacks camera / media permissions

**Bug:** `docs/bugs/mobile-pantry-vision-permissions.md`  
**RCA:** `docs/rca/mobile-pantry-vision-permissions-rca.md`  

---

## Fix Approach

1. Add `expo-image-picker` config plugin to `app.json` with camera + photos permission strings.
2. Add iOS `infoPlist` camera / photo library usage descriptions (plugin usually injects; set explicitly for clarity).
3. Add Android manifest permissions: `CAMERA`, `READ_MEDIA_IMAGES` (API 33+), keep existing storage reads for older APIs.

No JS flow changes — product already supports gallery + camera.

## Alternatives Considered

| Option | Why rejected |
|--------|----------------|
| Only document rebuild steps | Does not fix missing declarations |
| Switch to `expo-camera` | Extra dependency; picker already chosen |

## Scope of Change

- `mobile/app.json`
- `mobile/android/app/src/main/AndroidManifest.xml`
- Mark bug Resolved; note: **native rebuild required** (`npx expo prebuild` / EAS / Android Studio rebuild)

## Data Migration

None.

## Rollback Plan

Revert the two config files.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Permission strings wrong language | Use clear EN product copy; can localize later |
| Extra Android permissions review | Only camera + media read needed for this feature |

## Regression Test Plan

1. Rebuild Android app after manifest change.
2. Inventory → camera → Take photo → permission prompt → capture → review.
3. Same entry → Choose from library → pick → review.
4. Chat paperclip same two paths.
