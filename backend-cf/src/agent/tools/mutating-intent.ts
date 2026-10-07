/**
 * Heuristic: user asks to change pantry / shopping / recipes / meal plans / preferences.
 * Used to block text-only false "saved" replies when tools were not called.
 */
export function looksLikeMutatingUserRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // ZH: write verb near pantry/shopping/recipe/menu domain
  if (
    /(新增|加入|加到|刪除|移除|更新|建立|幫我加|記[下到]).{0,24}(庫存|冰箱|購物|食譜|菜單|偏好)/u.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /(庫存|冰箱|購物|食譜|菜單).{0,24}(新增|加入|加到|刪除|移除|更新|建立)/u.test(t)
  ) {
    return true;
  }

  // EN: write verb near domain (either order)
  if (
    /\b(add|remove|delete|update|create|save|log)\b[\s\S]{0,48}\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan|preferences?)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan|preferences?)\b[\s\S]{0,48}\b(add|remove|delete|update|create|save|log)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  return false;
}

export const MUTATION_TOOL_NUDGE =
  'You must call the appropriate tool to apply this change. Do not claim any data was saved or updated without calling a tool.';

export const MUTATION_NO_TOOL_FALLBACK =
  'I could not update your data because no tool was started. Nothing was saved. Please try again, or make the change in Kitchen Inventory / the relevant screen.';
