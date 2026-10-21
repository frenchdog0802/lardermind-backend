# RCA: Mobile Add to Calendar recipe search icon misaligned

**Bug:** `docs/bugs/mobile-calendar-add-search-icon-misaligned.md`  
**Status:** Confirmed via code inspection + screenshot  

---

## Root Cause

In `CalendarScreen`’s Add to Calendar modal, the Lucide `Search` icon is given NativeWind layout classes **on the icon component itself**:

```tsx
<Search size={20} color={colors.muted} className="absolute left-3 top-3.5" />
```

`lucide-react-native` icons do **not** reliably apply NativeWind `className` positioning (`absolute` / `left-*` / `top-*`). Those classes are ignored for layout, so the icon participates in normal document flow and renders **after** the `TextInput` (below the field).

The `TextInput` still uses `pl-10`, which reserves left padding for an overlaid icon that never overlays — matching the screenshot.

## Contributing Factors

1. **Inconsistent pattern vs other screens:** Shopping List and Recipe Manager correctly wrap the icon:

   ```tsx
   <View className="absolute left-3 top-3 z-10">
     <SearchIcon size={18} color={colors.muted} />
   </View>
   ```

2. **Web mental model:** Applying `absolute` on the icon itself works in DOM/SVG web layouts; RN SVG icons do not behave the same.
3. **No UI regression test** for Calendar Add modal search field structure.

## Affected Components

| Component | Role |
|-----------|------|
| `mobile/src/screens/CalendarScreen.tsx` | Broken Add modal recipe search layout |
| Shopping / Recipe search fields | Correct reference pattern (unaffected) |

## Data / State Impact

None. Pure layout/UI. No API or persistence impact.

## Timeline

Introduced when Calendar Add modal recipe search was built with icon `className` absolute positioning instead of a wrapping `View`. Present in current `CalendarScreen.tsx`.

## Why it wasn't caught earlier

- Desktop/web layout intuition for icons; RN behavior differs.
- Visual QA may have focused on Month/Week calendar, not the Add sheet search chrome.
- No unit/UI test asserting the icon wrapper exists with absolute positioning.

## Plausible alternatives (ranked)

1. **Most likely (confirmed):** `className` on Lucide `Search` does not apply absolute layout → icon flows below input.
2. Less likely: Parent `relative` missing — parent has `className="relative mb-6"`; even with relative, child absolute on icon still fails without a positioned View.
3. Ruled out: Wrong icon asset — icon is the intended Search/magnifier; problem is placement only.
