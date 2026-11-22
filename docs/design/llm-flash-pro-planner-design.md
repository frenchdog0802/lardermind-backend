# Design: LLM routing flash / planner

- `ai-gateway.ts`: `DEFAULT_LLM_MODEL='deepseek-flash'`, `DEFAULT_PLANNER_MODEL='deepseek-v4-pro'`, `resolvePlannerModel(env)`.
- `llm-chat.ts`: `completeChat({profile})`, `profile: 'chat' | 'planner'`. Body gets `thinking: {type:'disabled'|'enabled'}` (top-level field, OpenAI-format raw HTTP per DeepSeek docs). Planner also `reasoning_effort: 'high'`. Response `message.reasoning_content` is copied into `rawAssistantMessage.reasoning_content` only (never into `content`/API responses). On planner non-OK response: retry once with chat profile, reasoning_content stripped from messages.
- `LlmMessage.reasoning_content?`; `messagesToPending`/`pendingToMessages` keep it so approval resume works.
- `PendingInterrupt.profile?: 'chat'|'planner'` so the continuation after approval keeps the planner.
- `agent/tools/plan-intent.ts`: `looksLikeMealPlanRequest(text)` (EN + ZH).
- `agent-loop.ts`: `runAgentTurn` picks profile; `resumeAgentTurn` uses `pending.profile`; passed through `CompleteChatFn`.
- Risks: heuristic misses → chat model plans (acceptable). Rollback: set `LLM_PLANNER_MODEL` = flash model name.

## Regression plan
Unit tests: model resolution, request body (thinking flags, reasoning_content passthrough, fallback), intent heuristic, wrangler config guard, pending round-trip.
