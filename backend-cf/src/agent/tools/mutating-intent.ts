/**
 * Heuristic: user asks to change pantry / shopping / recipes / meal plans / preferences.
 * Used to block text-only false "saved" replies when tools were not called.
 */
export function looksLikeMutatingUserRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // ZH: write verb near pantry/shopping/recipe/menu domain
  if (
    /(新增|加入|加到|刪除|移除|更新|建立|幫我加|記[下到]|減少|減量|扣掉|減掉|排進|寫進).{0,24}(庫存|冰箱|購物|食譜|菜單|偏好|食材|行事曆|日曆)/u.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /(庫存|冰箱|購物|食譜|菜單|食材|行事曆|日曆).{0,24}(新增|加入|加到|刪除|移除|更新|建立|減少|減量|扣掉|減掉|排進|寫進)/u.test(
      t,
    )
  ) {
    return true;
  }
  if (/(加到|加入|排進|寫進).{0,12}(行事曆|日曆|菜單|calendar)/iu.test(t)) {
    return true;
  }

  // ZH: delete / reduce with quantity units (e.g. 刪除 10 包排骨 / 排骨減 3 包)
  if (
    /(刪除|移除|扣掉|減掉|減少).{0,40}(\d+\s*(包|份|個|克|公斤|g|kg|pcs)?)/u.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /([\u4e00-\u9fffA-Za-z]{1,20}).{0,6}減\s*\d+/u.test(t) ||
    /減\s*\d+\s*(包|份|個|克|公斤|g|kg)?/u.test(t)
  ) {
    return true;
  }

  // EN: write verb near domain (either order)
  if (
    /\b(add|remove|delete|update|create|save|log|reduce|subtract)\b[\s\S]{0,48}\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan|preferences?)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan|preferences?)\b[\s\S]{0,48}\b(add|remove|delete|update|create|save|log|reduce|subtract)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  // EN: remove/reduce N units of something without saying pantry
  if (
    /\b(remove|delete|reduce|subtract)\b[\s\S]{0,40}\b\d+\b/i.test(t) ||
    /\b(remove|delete)\b[\s\S]{0,40}\b(packs?|bags?|pcs|pieces?|g|kg)\b/i.test(t)
  ) {
    return true;
  }

  return false;
}

export const MUTATION_TOOL_NUDGE =
  'You must call the appropriate tool to apply this change. Do not claim any data was saved or updated without calling a tool.';

export const MUTATION_NO_TOOL_FALLBACK =
  'I could not update your data because no tool was started. Nothing was saved. Please try again, or make the change in Kitchen Inventory / the relevant screen.';
