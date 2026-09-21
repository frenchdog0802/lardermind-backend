# Feature: Mobile Chat Composer Redesign

**Status:** In progress  
**Scope:** Mobile app only (`mobile/`) — Chat composer (typing bar) visual + interaction UX  
**Out of scope:** Web composer, backend/API, pantry-vision recognition logic, empty-state CTAs, new attach capabilities

**Design:** [mobile-chat-composer-redesign-design.md](../design/mobile-chat-composer-redesign-design.md)  
**Tasks:** [tasks/mobile-chat-composer-redesign/](../../tasks/mobile-chat-composer-redesign/)

---

## 1. Summary

Redesign the Chat screen’s bottom typing bar so it reads as a clear, inviting control — not a low-contrast strip that blends into the page.

Today the field uses `bg-linen` inside a `bg-surface` footer with a faint `border-line`, tight icon padding, and a always-on sage send circle. Users struggle to see where to type; send affordance is ambiguous when empty.

### Locked decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | **Mobile only** | Screenshot / pain is the RN composer (attach + send) |
| Theme tokens | **Warm Kitchen unchanged** | Herb / linen / surface / ink / line only |
| Hierarchy | Footer **linen**, field **surface** + clearer edge | Invert current linen-in-surface blend |
| Chrome | Soft float (inset + light elevation); no heavy dock bar | Feels like a message field, not a toolbar |
| Send idle | Ghost / muted icon only (no filled sage blob) | Ready state = herb fill only when `canSend` |
| Attach icon | Keep **paperclip**; enlarge hit target | Existing pantry-vision affordance; no IA change |
| Copy | Keep `ai.placeholder` | Copy change not required for this visual fix |
| Web parity | **Out of scope** | Separate follow-up if desired |

### What changes

| Area | Before | After |
|------|--------|-------|
| Field vs chrome contrast | Linen field on surface footer ≈ invisible | Surface field on linen chrome; readable border + soft shadow |
| Padding / hit targets | ~32px icons, `px-1.5` | ≥40px controls, comfortable horizontal padding |
| Send idle | Sage filled circle always | Muted outline/ghost send; herb fill only when ready |
| Focus | Border only via NativeWind classes | Herb-tint border when focused |
| Footer | Hard `border-t` full dock | Quiet hairline or none; horizontal inset |

---

## 2. Current system

[`AICookingAssistantScreen.tsx`](../../mobile/src/screens/AICookingAssistantScreen.tsx) bottom composer:

- Footer: `bg-surface border-t border-line`
- Pill: `rounded-[22px] border border-line bg-linen`
- Left: `PaperclipIcon` → `handleAttachPantryImage`
- Center: multiline `TextInput` auto-grow (`INPUT_MIN_HEIGHT` … `INPUT_MAX_HEIGHT`)
- Right: `SendIcon` in `bg-herb` / `bg-sage` circle gated by `canSend`

Tokens: [`mobile/src/theme/tokens.ts`](../../mobile/src/theme/tokens.ts)  
Design system: [`frontend/design-system/lardermind/MASTER.md`](../../frontend/design-system/lardermind/MASTER.md)

---

## 3. Requirements

### 3.1 Visual

1. Composer must be distinguishable from the page background at a glance (contrast + edge).
2. Stay within Warm Kitchen tokens; one accent (**herb**) for primary send.
3. Soft elevation allowed (subtle shadow); no multi-layer glow, no purple, no dark-mode skin.
4. Corner radius stays pill-like (~20–24) consistent with current chat-first look.

### 3.2 Interaction

1. Attach remains one tap → existing pantry image pick / recognize flow.
2. Send enabled only when trimmed text non-empty and not streaming / not pending approval (existing `canSend`).
3. Multiline auto-grow behavior preserved; icons align to bottom when multiline.
4. Focus shows herb-tint border (or equivalent) so keyboard users know the field is active.
5. Touch targets for attach / send ≥ 40×40 pt.

### 3.3 Accessibility

1. Keep `accessibilityLabel` on attach (`pantryVision.attach`) and send.
2. Disabled send must not look interactive (no strong fill).
3. Placeholder contrast remains readable (`colors.muted` on surface is OK; do not lighten further).

### 3.4 Non-goals

- Changing attach product behavior or adding camera-first UI sheets redesign
- Web `AICookingAssistant` composer restyle
- New animations beyond a short press opacity / color transition (~200ms)

---

## 4. Edge cases

| Case | Expected |
|------|----------|
| Empty input | Ghost send; attach enabled (unless recognizing / typing) |
| Recognizing image | Attach shows spinner; input/send per existing rules |
| Streaming (`isTyping`) | Input not editable; send disabled |
| `pendingApproval` | Send disabled (`canSend` false) |
| Long multiline | Field grows to max height then scrolls; icons stay bottom-aligned |
| Safe area | Bottom padding still respects `insets.bottom` |

---

## 5. UX / security / performance notes

- **UX:** Primary fix is figure-ground (surface on linen) + honest send state.
- **Security:** No change; attach still uses existing pick + API path.
- **Performance:** Style-only; no extra re-renders beyond a local `focused` boolean.

---

## 6. Acceptance

1. On Chat screen, the typing bar is visually distinct from the linen page without looking like a heavy card dock.
2. Empty state: send is muted/ghost; with text: herb filled send.
3. Attach and send hit targets feel comfortable (not edge-cramped).
4. Focus shows herb-tint border.
5. Existing attach + send + stream + approval flows still work unchanged.
6. Warm Kitchen tokens only; no new brand colors.
