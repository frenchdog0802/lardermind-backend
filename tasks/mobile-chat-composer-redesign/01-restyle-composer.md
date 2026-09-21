# Task 01: Restyle Chat composer

## Goal

Apply the visual + interaction redesign from the design doc to the mobile Chat typing bar.

## Files

- `mobile/src/screens/AICookingAssistantScreen.tsx`

## Work

1. Chrome: `bg-linen`; remove heavy dock feel (drop or soften `border-t`); keep safe-area bottom padding.
2. Field: `bg-surface`, clearer border, soft elevation, `rounded-[22px]`, comfortable inner padding.
3. Attach / Send: ≥40×40 hit targets; send idle = muted ghost (no sage fill); ready = `bg-herb`.
4. Add `composerFocused` → herb-tint border on focus.
5. Preserve attach/send/multiline/`canSend` behavior.

## Acceptance

- Matches design §2 visual spec.
- No API or attach-logic changes.
- Warm Kitchen tokens only.
