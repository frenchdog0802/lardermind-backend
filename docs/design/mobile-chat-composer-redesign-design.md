# Design: Mobile Chat Composer Redesign

**Feature:** [mobile-chat-composer-redesign.md](../features/mobile-chat-composer-redesign.md)  
**Status:** Ready for implementation

---

## 1. Architecture overview

UI-only change inside [`AICookingAssistantScreen.tsx`](../../mobile/src/screens/AICookingAssistantScreen.tsx). No new routes, APIs, or shared packages.

Optional: extract a local `ChatComposer` presentational block in the same file or `mobile/src/components/chat/ChatComposer.tsx` if the JSX block exceeds ~40 lines of clarity need. Prefer **same-file first** unless extraction clearly helps tests.

```
Chat screen
└─ KeyboardAvoidingView
   ├─ FlashList (messages)
   └─ Composer chrome (linen)
      └─ Field (surface + border + shadow)
         ├─ Attach (40pt)
         ├─ TextInput (flex)
         └─ Send (40pt; ghost | herb)
```

---

## 2. Visual spec

### 2.1 Chrome

| Prop | Value |
|------|-------|
| Background | `bg-linen` (page continuity) |
| Top rule | Omit hard `border-t`, or use very light `border-line` only if separation is needed against long transcripts |
| Horizontal inset | `px-3` (12) on chrome; field itself full width inside that |
| Bottom | `paddingBottom: max(insets.bottom, 12)` |

### 2.2 Field

| Prop | Value |
|------|-------|
| Background | `bg-surface` (`#FAF8F3`) |
| Border | `border-line` default; focused → `#4F6B4A` at ~40–50% opacity or solid `herb` at 1–1.5px |
| Radius | `rounded-[22px]` (unchanged language) |
| Inner padding | `pl-1 pr-1 py-1` with 40×40 controls → effective text inset ~12–14 from outer edge |
| Elevation | iOS: light shadow (`shadowOpacity` ~0.08, `radius` 8, `offset.y` 2); Android: `elevation: 2` |
| Min height | Comfortable single-line row ≈ 48pt including padding |

### 2.3 Attach

- Size: `h-10 w-10` (40)
- Icon: `PaperclipIcon` size 18–20, color `colors.muted`
- Pressed: slight opacity 0.7
- Loading: existing `ActivityIndicator` with `colors.herb`

### 2.4 Send

| State | Appearance |
|-------|------------|
| Idle / disabled | Transparent bg; `SendIcon` `colors.muted` (no sage fill) |
| Ready (`canSend`) | `bg-herb`; icon `colors.onHerb` |
| Pressed ready | `bg-herbDeep` if easy; else opacity |

### 2.5 TextInput

- Unchanged grow constants (`INPUT_LINE_HEIGHT` 22, min 22, max 100) unless visual min row needs +2–4 padding via wrapper, not by changing line math.
- `placeholderTextColor={colors.muted}`
- Local state `composerFocused` via `onFocus` / `onBlur` drives border color.

---

## 3. Interface / signatures

No public API changes. Local only:

```ts
const [composerFocused, setComposerFocused] = useState(false);
```

Border class / style switch:

```ts
borderColor: composerFocused ? colors.herb : colors.line
// or herb at 0.45 opacity via rgba if solid herb is too strong
```

---

## 4. Business logic flow

Unchanged: `handleAttachPantryImage`, `handleSend`, `canSend`, `isTyping`, `recognizing`, `pendingApproval`.

---

## 5. Edge cases & errors

Covered in feature doc §4. Design adds: when multiline, `items-end` on the row so attach/send sit on the last line baseline (already present).

---

## 6. Performance & security

- One boolean state for focus — negligible.
- No new network or storage.

---

## 7. Risks

| Risk | Mitigation |
|------|------------|
| Shadow looks “cardy” vs Warm Kitchen anti-card rule | Keep elevation minimal; field is an interactive control (allowed) |
| Herb focus border too loud | Use softer opacity if visual QA complains |
| Android elevation + border double-heavy | Prefer border-first; elevation 1–2 only |

---

## 8. Implementation notes

1. Edit composer JSX/styles in `AICookingAssistantScreen.tsx` only (unless extracting).
2. Use `colors` from tokens for any StyleSheet shadow/border that NativeWind cannot express cleanly.
3. Do not restyle message bubbles or empty state in this task.
4. Manual QA on Android emulator: empty, typing, multiline, attach spinner, streaming disabled.
