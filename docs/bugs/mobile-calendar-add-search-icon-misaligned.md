# Bug: Mobile Add to Calendar recipe search icon misaligned

**Status:** Resolved  
**Resolved by:** Wrap Lucide `Search` in absolute-positioned `View` (Shopping/Recipes pattern) in Calendar Add modal  
**Fix design:** `docs/fixes/mobile-calendar-add-search-icon-misaligned-fix.md`  
**RCA:** `docs/rca/mobile-calendar-add-search-icon-misaligned-rca.md`  

---

## Current Behavior

On the mobile Cooking Calendar **Add to Calendar** bottom sheet, the recipe search field shows a magnifying-glass icon **below** the text input (outside the field), instead of overlaid on the left inside the input. The input still has left padding as if an icon were inside, so the layout looks broken.

## Expected Behavior

The search icon should sit inside the recipe search input on the left (same pattern as Shopping List and Recipe Manager search fields), vertically aligned with the placeholder text.

## Reproduction Steps

1. Open the Expo mobile app and go to **Cooking Calendar**.
2. Tap **+** (header) or **+ Add** on a selected day to open **Add to Calendar**.
3. Look at the **Recipe** field labeled with placeholder `Search recipe...`.
4. Observe the search (magnifying glass) icon rendered under the input, not inside it.

## Environment

- App: `mobile/` (Expo / React Native + NativeWind)
- Reproduced on mobile device UI (screenshot from reporter)
- Screen: Calendar → Add to Calendar modal

## Related Files

- `mobile/src/screens/CalendarScreen.tsx` — Add modal recipe search `TextInput` + `Search` icon
- Contrast (correct pattern): `mobile/src/screens/ShoppingListScreen.tsx`, `mobile/src/screens/RecipeManagerScreen.tsx`

## Impact Scope

- Cosmetic / UX layout only on Add to Calendar recipe picker.
- Does not block selecting a recipe or adding a meal (search typing still works).
- Only Calendar Add modal; other screens that wrap the icon in an absolutely positioned `View` are unaffected.

## Reproducibility Notes

- Screenshot confirms icon sits under the input, left-aligned with the field edge.
- Code inspection of `CalendarScreen` shows `Search` receives `className="absolute left-3 top-3.5"` directly (unlike Shopping/Recipes, which wrap the icon in `<View className="absolute ...">`).

## Additional Information Needed (optional)

None for layout fix; screenshot + code are sufficient.

## Related Documents

- `docs/features/mobile-warm-kitchen-alignment.md` (if present; visual system context)
