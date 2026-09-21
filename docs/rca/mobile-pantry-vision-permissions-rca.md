# RCA: Mobile pantry photo pick lacks camera / media permissions

**Bug:** `docs/bugs/mobile-pantry-vision-permissions.md`  
**Status:** Confirmed via manifest / app.json inspection  

---

## Root Cause

`pickPantryImage` correctly requests runtime permissions via `expo-image-picker`, but the **native project does not declare** the required OS permissions / usage strings:

1. `AndroidManifest.xml` — no `android.permission.CAMERA` (and no Android 13+ `READ_MEDIA_IMAGES`).
2. `app.json` — `expo-image-picker` is a dependency but **not** listed under `plugins`, so prebuild does not inject iOS `NSCameraUsageDescription` / `NSPhotoLibraryUsageDescription` (or Android equivalents).

Without the manifest declaration, Android will not grant camera access even if the JS request runs.

## Contributing Factors

- Feature UI landed before native permission config was finished.
- Dev client / partial rebuilds can mask missing plugin until a clean native rebuild.

## Affected Components

| Component | Role |
|-----------|------|
| `app.json` | Expo config plugins / iOS infoPlist |
| `AndroidManifest.xml` | Android permission declarations |
| `pantryImagePick.ts` | Runtime request (already correct) |

## Data / State Impact

None.

## Why it wasn't caught earlier

UI and API paths were tested or assumed; native permission declarations were not verified in `AndroidManifest` / `app.json`.
