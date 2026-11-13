/**
 * Heuristic: user asks to change pantry / shopping / recipes / meal plans / preferences.
 * Used to block text-only false "saved" replies when tools were not called.
 *
 * Draft / planning asks (grocery list of missing items, what should I buy) must NOT match.
 */
export function looksLikeMutatingUserRequest(text: string): boolean {
  const t = text.trim();
  if (!t) return false;

  // Planning / draft list asks — not a write until the user explicitly saves.
  if (
    /\b(make|generate|draft|suggest|show|give)\b[\s\S]{0,40}\b(grocery|shopping)\s+list\b/i.test(
      t,
    ) ||
    /\b(grocery|shopping)\s+list\b[\s\S]{0,40}\b(missing|shortages?|what\s+to\s+buy)\b/i.test(
      t,
    ) ||
    /\bwhat\s+should\s+i\s+buy\b/i.test(t) ||
    /\b(幫我)?(列|做|產生|產生一下|給我)(一)?(個)?(購物|採買)清單/u.test(t) ||
    /缺什麼|還缺什麼|要買什麼/u.test(t)
  ) {
    // Still mutation if they also explicitly ask to persist into their list/pantry.
    const explicitPersist =
      /\b(add|save|write|log)\b[\s\S]{0,48}\b(to\s+(my\s+)?(shopping(\s+list)?|pantry|inventory))\b/i.test(
        t,
      ) ||
      /(加到|加入|寫進|存到).{0,12}(購物|庫存|冰箱)/u.test(t);
    if (!explicitPersist) return false;
  }

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

  // EN: explicit persist verbs near stored domains (not bare "create a shopping list")
  if (
    /\b(add|remove|delete|update|save|log|reduce|subtract)\b[\s\S]{0,48}\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan|preferences?)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan|preferences?)\b[\s\S]{0,48}\b(add|remove|delete|update|save|log|reduce|subtract)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // "create recipe" / "create meal plan" are writes; "create a shopping list" alone is draft (excluded above)
  if (
    /\bcreate\b[\s\S]{0,48}\b(recipe|meal\s*plan)\b/i.test(t) ||
    /\b(recipe|meal\s*plan)\b[\s\S]{0,48}\bcreate\b/i.test(t)
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

/** Model claimed a write succeeded (Chinese/English) without tools — prefer hard fallback. */
export function looksLikeFalseMutationSuccess(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (
    /(已加入|已新增|已更新|已刪除|已移除|已寫入|已保存|已存入).{0,16}(庫存|冰箱|購物|食譜|菜單|行事曆|日曆)/u.test(
      t,
    )
  ) {
    return true;
  }
  if (
    /\b(added|updated|removed|deleted|saved|logged)\b[\s\S]{0,48}\b(pantry|inventory|shopping(?:\s+list)?|recipe|meal\s*plan)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/已加入庫存|已加入冰箱|✅/.test(t) && /(庫存|冰箱|購物|食譜)/u.test(t)) {
    return true;
  }
  return false;
}
