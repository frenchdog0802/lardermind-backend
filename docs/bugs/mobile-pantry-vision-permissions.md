# Bug: Mobile pantry photo pick lacks camera / media permissions

**Status:** Resolved  
**Resolved by:** `expo-image-picker` plugin + Android `CAMERA` / `READ_MEDIA_IMAGES`  
**Fix design:** `docs/fixes/mobile-pantry-vision-permissions-fix.md`  
**RCA:** `docs/rca/mobile-pantry-vision-permissions-rca.md`  

---

## Current Behavior

Pantry inventory camera button and Chat paperclip call `pickPantryImage` (camera or library). On Android native builds, camera permission is not declared in `AndroidManifest.xml`, and `app.json` has no `expo-image-picker` plugin / iOS usage strings. Camera (and possibly library on newer Android) can fail or never prompt correctly.

## Expected Behavior

User can choose **Take photo** or **Choose from library**, grant OS permissions when asked, and proceed to recognition → review → apply.

## Reproduction Steps

1. Open Inventory → tap camera, or Chat → paperclip.
2. Choose Take photo on Android device/emulator build.
3. Observe permission denial / silent failure / no camera launch.

## Environment

- `mobile/` Expo ~54 / Android
- `expo-image-picker` installed; plugin not in `app.json`
- `AndroidManifest.xml` has no `CAMERA`

## Related Files

- `mobile/app.json`
- `mobile/android/app/src/main/AndroidManifest.xml`
- `mobile/src/utils/pantryImagePick.ts`

## Impact Scope

- Blocks pantry vision capture path on Android; library may still work on older APIs.
- iOS App Store may reject / runtime deny without usage descriptions after prebuild.

## Related Documents

- `docs/features/pantry-image-recognition.md`
- `docs/features/backend-cf-ai-gateway.md`
