# Fix Design: Mobile Add to Calendar recipe search icon misaligned

**Bug:** `docs/bugs/mobile-calendar-add-search-icon-misaligned.md`  
**RCA:** `docs/rca/mobile-calendar-add-search-icon-misaligned-rca.md`  

---

## Fix Approach

Match the existing Shopping List / Recipe Manager pattern in the Calendar Add modal:

1. Keep the parent `View` with `relative`.
2. Wrap Lucide `Search` in `<View className="absolute left-3 top-3 z-10" …>` (do **not** put absolute/left/top on the icon).
3. Keep `TextInput` `pl-10` so text clears the icon.
4. Add a stable `testID` on the icon wrapper for a regression test.

This is the smallest correct fix: same proven pattern already used elsewhere in the app.

## Alternatives Considered

| Option | Why rejected / deferred |
|--------|-------------------------|
| `style={{ position: 'absolute', … }}` on `Search` | May work for some Lucide versions, but diverges from established NativeWind `View` wrapper pattern |
| Remove the icon | Workaround — loses affordance; not a fix |
| Shared `SearchField` component across screens | Nice cleanup; out of scope for this bug |
| Absolute classes via NativeWind on Lucide (status quo) | Confirmed broken root cause |

## Scope of Change

- `mobile/src/screens/CalendarScreen.tsx` — wrap search icon; add `testID`
- `mobile/src/__tests__/screens/calendar-add-search-icon.test.tsx` — fail-first regression
- Docs: bug / rca / this fix; mark bug Resolved after implementation

## Data Migration / Backfill

None.

## Rollback Plan

Revert the CalendarScreen icon markup and the new test file. Behavior returns to misaligned icon.

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Vertical alignment differs slightly by font metrics | Use same `left-3 top-3` as Shopping/Recipes |
| Modal layout shift | No; icon moves from below into reserved `pl-10` space |

## Regression Test Plan

1. **Unit (required):** Open Add modal (or render with modal visible); assert `calendar-recipe-search-icon-wrap` exists and recipe search placeholder is present. Fail before wrap/`testID`; pass after.
2. **Manual:** Open Add to Calendar on device/simulator; confirm icon is inside the left of the search field.
3. Smoke existing mobile Jest suite.
