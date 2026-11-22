# Tasks: LLM flash / planner routing
Feature: docs/features/llm-flash-pro-planner.md · Design: docs/design/llm-flash-pro-planner-design.md

1. Config: ai-gateway.ts defaults, wrangler.toml, env.ts
2. completeChat: profile, thinking flags, reasoning_content, fallback
3. Routing: plan-intent heuristic, agent-loop + pending profile
4. Tests + typecheck
5. PR into dev, staging deploy + smoke
