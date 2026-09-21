# Design: Cloudflare chat tools + HITL

**Feature:** `docs/features/backend-cf-chat-tools.md`

---

## 1. Architecture

```
stream/send → agentLoop
  → LLM (tools) 
  → if mutating pending → save pending_interrupt_json → SSE interrupt
  → if read-only → execute → append tool results → loop
  → if text → SSE tokens + done (card type if prior tools)

resume → load pending → approve? execute : skip
  → optional LLM wrap-up → JSON ChatResponse → clear pending
```

Max agent rounds: **8** (env `CHAT_RECURSION_LIMIT` default 8).

---

## 2. Schema `0005_chat_hitl.sql`

```sql
ALTER TABLE chat_sessions ADD COLUMN locked_at INTEGER;
ALTER TABLE chat_sessions ADD COLUMN pending_interrupt_json TEXT;
```

Pending JSON:

```ts
{
  createdAt: number;
  pendingTools: { name: string; argsSummary: string; id?: string }[];
  toolCalls: { id: string; name: string; arguments: Record<string, unknown> }[];
  messages: { role: string; content?: string; tool_calls?: unknown; tool_call_id?: string; name?: string }[];
}
```

---

## 3. v1 tools

### Read-only (auto)

| name | Executor |
|------|----------|
| `listPantry` | listPantryItems → summary |
| `listMyRecipes` | listRecipes |
| `getRecipeDetails` | getRecipeDto |
| `listMealPlans` | listMealPlans |
| `getPreferences` | getOrCreatePreferences → dto |
| `suggestMealsFromPantry` | naive score recipes vs pantry names → meal_suggestions card data |

### Mutating (HITL)

| name | Executor | Card |
|------|----------|------|
| `addPantryItems` | mergeAddPantryItem × N | pantry_updated |
| `addItemsToShoppingList` | createShoppingListItem × N | shopping_list_updated |
| `createRecipe` | createRecipe | recipe_created |
| `addRecipeToMenu` | createMealPlan | meal_plan_updated |
| `updatePreferences` | upsertPreferences | preferences_updated |

Tool JSON schemas: OpenAI function format; `userId` never from model (closed over).

---

## 4. openai-compat

Add `completeChat()` non-stream helper returning `{ content, toolCalls }` from AI Gateway.

Streaming token iterator remains for optional final text chunking.

---

## 5. Card aggregation

After executing tools (resume approve or auto read-only path that ends with text), pick primary card:

- Prefer last mutating tool’s card type
- Else `text`
- `multi_action` if ≥2 different mutating types in one batch

---

## 6. Files

| Path | Role |
|------|------|
| `migrations/0005_chat_hitl.sql` | columns |
| `db/chat.ts` | get/set pending, lock helpers |
| `agent/tools/definitions.ts` | tool schemas |
| `agent/tools/execute.ts` | executors |
| `agent/tools/hitl.ts` | mutating set + summaries |
| `agent/agent-loop.ts` | loop + resume |
| `agent/stream-chat.ts` | wire SSE |
| `routes/chat.ts` | resume + send |
| `lib/openai-compat.ts` / `lib/llm-chat.ts` | completions |

---

## 7. Tests

- Unit: mutating classification; argsSummary
- Loop: mock LLM returns tool_calls → interrupt persisted
- Resume approve executes; reject skips
- Read-only listPantry no interrupt
