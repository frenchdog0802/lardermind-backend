/**
 * Heuristic: the user wants meals planned over several days / a week (or a single
 * plan for a day). Routes the turn to the planner model (deepseek-v4-pro, thinking).
 * Only affects model choice, never tools or behavior, so misses are harmless.
 */
export function looksLikeMealPlanRequest(text: string | null | undefined): boolean {
  const t = (text ?? '').trim();
  if (!t) return false;

  // EN: plan/schedule/organise ... meals/menu/dinners/week
  if (
    /\b(plan|planning|schedule|map\s+out|arrange|organi[sz]e)\b[\s\S]{0,40}\b(meals?|menu|dinners?|lunch(es)?|breakfasts?|week|days?|calendar)\b/i.test(
      t,
    ) ||
    /\b(meal|weekly|week'?s?|dinner)\s+(plan|planner|menu|schedule)\b/i.test(t) ||
    /\b(meals?|menu|dinners?)\b[\s\S]{0,30}\b(for|over|this|next)\s+(the\s+)?(week|\d+\s+days)\b/i.test(
      t,
    )
  ) {
    return true;
  }

  // ZH: 排/規劃/安排 ... 餐/菜單/一週/本週/幾天
  if (
    /(排|規劃|安排|計劃|計畫|規画|安排).{0,12}(餐|菜單|一週|一周|本週|本周|下週|下周|週|周|[0-9一二三四五六七八九十兩]+天|晚餐|午餐|早餐)/u.test(
      t,
    ) ||
    /(一週|一周|本週|本周|下週|下周|[0-9一二三四五六七八九十兩]+天).{0,8}(菜單|餐|晚餐|午餐|早餐)/u.test(
      t,
    ) ||
    /(週|周)(餐|菜單|計劃|計畫)/u.test(t)
  ) {
    return true;
  }
  return false;
}
