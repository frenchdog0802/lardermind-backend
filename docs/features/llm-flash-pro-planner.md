# Feature: LLM routing — deepseek-flash chat + deepseek-v4-pro planner

## What / why
- Normal chat moves from legacy `deepseek-chat` to `deepseek-flash` in **non-thinking** mode (cheap, fast).
- Meal-plan requests use `deepseek-v4-pro` with **thinking enabled** (`LLM_PLANNER_MODEL`) for better multi-day planning quality.
- Pantry vision stays on OpenAI `gpt-4o` (unchanged).

## Scope
- `DEFAULT_LLM_MODEL = deepseek-flash`; `LLM_MODEL` in wrangler (prod + staging).
- New `LLM_PLANNER_MODEL` (default `deepseek-v4-pro`) in wrangler (prod + staging) and `Env`.
- Meal-plan generation is not a separate endpoint: it is the agent tool loop (`planMeals`). A heuristic (`looksLikeMealPlanRequest`) routes a turn (and its approval continuation) to the planner profile.
- DeepSeek docs: thinking is ON by default, so chat must send `thinking: {type: "disabled"}` explicitly; planner sends `thinking: {type: "enabled"}`.
- `reasoning_content` is never returned to clients (non-streaming; only `content` is read). With tools it MUST be passed back to the API, so it is kept on the in-flight assistant message and persisted in the pending approval.
- Planner failure falls back to the chat model (non-thinking) so users still get a reply.

## Out of scope
Vision model, streaming to clients, quota changes, UI.

## Edge cases
- History rebuilt from DB has no `reasoning_content` → possible 400 from provider → fallback retry on flash.
- Heuristic false positives/negatives only change model choice, never behavior/tools.
