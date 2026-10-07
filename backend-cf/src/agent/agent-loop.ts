import type { Env } from '../env';
import {
  clearPendingInterrupt,
  getPendingInterrupt,
  getRecentMessagesForModel,
  insertMessage,
  releaseSessionLock,
  setPendingInterrupt,
  tryAcquireSessionLock,
  type PendingInterrupt,
} from '../db/chat';
import { findUserById } from '../db/users';
import { resolveEntitlement } from '../db/subscriptions';
import {
  checkAndIncrementAiMessage,
  QuotaExceededError,
} from '../db/quotas';
import {
  completeChat,
  type ChatCompletionResult,
  type LlmMessage,
  type ParsedToolCall,
} from '../lib/llm-chat';
import { nowUnixSeconds } from '../lib/time';
import { COOKING_ASSISTANT_SYSTEM_PROMPT } from './system-prompt';
import { COOKING_TOOLS } from './tools/definitions';
import { aggregateCard, type ToolCardEvent } from './tools/cards';
import { executeTool, type ToolExecResult } from './tools/execute';
import { isMutatingTool, toPendingTools } from './tools/hitl';
import {
  looksLikeMutatingUserRequest,
  MUTATION_NO_TOOL_FALLBACK,
  MUTATION_TOOL_NUDGE,
} from './tools/mutating-intent';

export type ChatResponsePayload = {
  type: string;
  message: string;
  data: Record<string, unknown>;
};

export type AgentTurnResult =
  | { kind: 'complete'; response: ChatResponsePayload }
  | {
      kind: 'interrupt';
      message: string;
      data: {
        sessionId: string;
        pendingTools: PendingInterrupt['pendingTools'];
      };
    }
  | { kind: 'busy'; message: string }
  | { kind: 'quota'; message: string }
  | { kind: 'error'; message: string };

export type CompleteChatFn = (input: {
  env: Env;
  messages: LlmMessage[];
  tools?: typeof COOKING_TOOLS;
  toolChoice?: 'auto' | 'required';
}) => Promise<ChatCompletionResult>;

export type ExecuteToolFn = (
  db: D1Database,
  userId: string,
  name: string,
  args: Record<string, unknown>,
) => Promise<ToolExecResult>;

type AgentDeps = {
  completeChat?: CompleteChatFn;
  executeTool?: ExecuteToolFn;
};

function recursionLimit(env: Env): number {
  const raw = Number(env.CHAT_RECURSION_LIMIT ?? '8');
  if (!Number.isFinite(raw) || raw < 1) return 8;
  return Math.min(Math.floor(raw), 32);
}

function messagesToPending(
  messages: LlmMessage[],
): Array<Record<string, unknown>> {
  return messages.map((m) => {
    const out: Record<string, unknown> = { role: m.role };
    if (m.content !== undefined) out.content = m.content;
    if (m.tool_calls) out.tool_calls = m.tool_calls;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.name) out.name = m.name;
    return out;
  });
}

function pendingToMessages(
  pending: Array<Record<string, unknown>>,
): LlmMessage[] {
  return pending.map((m) => {
    const role = String(m.role) as LlmMessage['role'];
    const msg: LlmMessage = { role };
    if (typeof m.content === 'string' || m.content === null) {
      msg.content = m.content as string | null;
    }
    if (Array.isArray(m.tool_calls)) {
      msg.tool_calls = m.tool_calls as LlmMessage['tool_calls'];
    }
    if (typeof m.tool_call_id === 'string') {
      msg.tool_call_id = m.tool_call_id;
    }
    if (typeof m.name === 'string') {
      msg.name = m.name;
    }
    return msg;
  });
}

async function appendToolResults(
  db: D1Database,
  userId: string,
  messages: LlmMessage[],
  toolCalls: ParsedToolCall[],
  cardEvents: ToolCardEvent[],
  options?: { skipMutating?: boolean; execute?: ExecuteToolFn },
): Promise<void> {
  const run = options?.execute ?? executeTool;
  for (const tc of toolCalls) {
    if (options?.skipMutating && isMutatingTool(tc.name)) {
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content: JSON.stringify({
          skipped: true,
          reason: 'User rejected this action',
        }),
      });
      continue;
    }

    const result = await run(db, userId, tc.name, tc.arguments);
    messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      name: tc.name,
      content: result.content,
    });
    if (result.cardType) {
      cardEvents.push({
        toolName: tc.name,
        cardType: result.cardType,
        data: result.cardData ?? {},
      });
    }
  }
}

async function finalizeText(
  env: Env,
  messages: LlmMessage[],
  cardEvents: ToolCardEvent[],
  complete: CompleteChatFn,
): Promise<ChatResponsePayload> {
  // If last turn already produced assistant text with no tools, use it.
  // Otherwise ask once more without forcing tools for a wrap-up.
  const last = messages[messages.length - 1];
  let text = '';
  if (
    last?.role === 'assistant' &&
    typeof last.content === 'string' &&
    last.content.trim() &&
    !last.tool_calls?.length
  ) {
    text = last.content.trim();
  } else {
    const wrap = await complete({
      env,
      messages: [
        ...messages,
        {
          role: 'user',
          content:
            'Briefly confirm the outcome for the user based on the tool results above. Do not call tools.',
        },
      ],
    });
    text =
      wrap.content.trim() ||
      'Done. Let me know if you need anything else.';
  }

  const card = aggregateCard(cardEvents);
  return {
    type: card.type,
    message: text,
    data: card.data,
  };
}

async function runToolLoop(
  env: Env,
  db: D1Database,
  userId: string,
  sessionId: string,
  messages: LlmMessage[],
  complete: CompleteChatFn,
  execute: ExecuteToolFn,
  originalUserMessage: string,
): Promise<AgentTurnResult> {
  const cardEvents: ToolCardEvent[] = [];
  const maxRounds = recursionLimit(env);
  let mutationNudgeUsed = false;
  let toolChoice: 'auto' | 'required' = 'auto';
  const mutatingIntent = looksLikeMutatingUserRequest(originalUserMessage);

  for (let round = 0; round < maxRounds; round++) {
    const result = await complete({
      env,
      messages,
      tools: COOKING_TOOLS,
      toolChoice,
    });
    toolChoice = 'auto';

    if (result.toolCalls.length === 0) {
      if (mutatingIntent && cardEvents.length === 0) {
        if (!mutationNudgeUsed) {
          mutationNudgeUsed = true;
          messages.push({ role: 'user', content: MUTATION_TOOL_NUDGE });
          toolChoice = 'required';
          continue;
        }
        return {
          kind: 'complete',
          response: {
            type: 'text',
            message: MUTATION_NO_TOOL_FALLBACK,
            data: {},
          },
        };
      }

      const text =
        result.content.trim() ||
        'Sorry, I could not generate a reply. Please try again.';
      const card = aggregateCard(cardEvents);
      return {
        kind: 'complete',
        response: {
          type: card.type === 'text' && cardEvents.length === 0 ? 'text' : card.type,
          message: text,
          data: card.data,
        },
      };
    }

    messages.push(result.rawAssistantMessage);

    const hasMutating = result.toolCalls.some((tc) => isMutatingTool(tc.name));
    if (hasMutating) {
      const pending: PendingInterrupt = {
        createdAt: nowUnixSeconds(),
        pendingTools: toPendingTools(result.toolCalls),
        toolCalls: result.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          arguments: tc.arguments,
        })),
        messages: messagesToPending(messages),
      };
      await setPendingInterrupt(db, userId, sessionId, pending);
      return {
        kind: 'interrupt',
        message:
          'I need your approval before making these changes.',
        data: {
          sessionId,
          pendingTools: pending.pendingTools,
        },
      };
    }

    await appendToolResults(
      db,
      userId,
      messages,
      result.toolCalls,
      cardEvents,
      { execute },
    );
  }

  return {
    kind: 'complete',
    response: {
      type: 'text',
      message:
        'I hit a step limit while working on that. Please try a simpler request.',
      data: {},
    },
  };
}

export async function runAgentTurn(
  env: Env,
  input: {
    userId: string;
    sessionId: string;
    message: string;
    /** When false, skip quota increment (not used for resume). */
    chargeQuota?: boolean;
  },
  deps?: AgentDeps,
): Promise<AgentTurnResult> {
  const db = env.DB;
  const complete = deps?.completeChat ?? completeChat;
  const execute = deps?.executeTool ?? executeTool;
  const chargeQuota = input.chargeQuota !== false;

  const existingPending = await getPendingInterrupt(
    db,
    input.userId,
    input.sessionId,
  );
  if (existingPending) {
    return {
      kind: 'busy',
      message:
        'There is a pending action waiting for your approval. Approve or reject it first.',
    };
  }

  const locked = await tryAcquireSessionLock(
    db,
    input.userId,
    input.sessionId,
  );
  if (!locked) {
    return {
      kind: 'busy',
      message: 'This chat is busy. Please wait a moment and try again.',
    };
  }

  try {
    if (chargeQuota) {
      const user = await findUserById(db, input.userId);
      const entitlement = await resolveEntitlement(
        db,
        input.userId,
        user?.role,
      );
      try {
        await checkAndIncrementAiMessage(db, input.userId, {
          isPro: entitlement.isPro,
          isAdmin: entitlement.isAdmin,
        });
      } catch (error) {
        if (error instanceof QuotaExceededError) {
          return { kind: 'quota', message: error.message };
        }
        throw error;
      }
    }

    await insertMessage(db, {
      userId: input.userId,
      sessionId: input.sessionId,
      role: 'user',
      content: input.message,
    });

    const history = await getRecentMessagesForModel(
      db,
      input.userId,
      input.sessionId,
    );
    const messages: LlmMessage[] = [
      { role: 'system', content: COOKING_ASSISTANT_SYSTEM_PROMPT },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    ];

    const turn = await runToolLoop(
      env,
      db,
      input.userId,
      input.sessionId,
      messages,
      complete,
      execute,
      input.message,
    );

    if (turn.kind === 'complete') {
      await insertMessage(db, {
        userId: input.userId,
        sessionId: input.sessionId,
        role: 'assistant',
        content: turn.response.message,
        responseType: turn.response.type,
        cardData:
          Object.keys(turn.response.data).length > 0
            ? turn.response.data
            : undefined,
      });
      await releaseSessionLock(db, input.userId, input.sessionId);
    }
    // interrupt: keep lock + pending

    return turn;
  } catch (error) {
    await releaseSessionLock(db, input.userId, input.sessionId).catch(
      () => undefined,
    );
    const message =
      error instanceof Error ? error.message : 'Chat agent failed';
    return { kind: 'error', message };
  }
}

export async function resumeAgentTurn(
  env: Env,
  input: {
    userId: string;
    sessionId: string;
    decision: 'approve' | 'reject';
    note?: string;
  },
  deps?: AgentDeps,
): Promise<AgentTurnResult> {
  const db = env.DB;
  const complete = deps?.completeChat ?? completeChat;
  const execute = deps?.executeTool ?? executeTool;

  const pending = await getPendingInterrupt(
    db,
    input.userId,
    input.sessionId,
  );
  if (!pending) {
    return {
      kind: 'error',
      message: 'No pending action to resume',
    };
  }

  // Lock may already be held from the interrupt stream; tryAcquire is best-effort.
  await tryAcquireSessionLock(db, input.userId, input.sessionId);

  try {
    const messages = pendingToMessages(pending.messages);
    const cardEvents: ToolCardEvent[] = [];
    const toolCalls: ParsedToolCall[] = pending.toolCalls.map((tc) => ({
      id: tc.id,
      name: tc.name,
      arguments: tc.arguments,
    }));

    if (input.decision === 'approve') {
      await appendToolResults(
        db,
        input.userId,
        messages,
        toolCalls,
        cardEvents,
        { execute },
      );
    } else {
      await appendToolResults(
        db,
        input.userId,
        messages,
        toolCalls,
        cardEvents,
        { skipMutating: true, execute },
      );
      if (input.note?.trim()) {
        messages.push({
          role: 'user',
          content: `I rejected the proposed changes. Note: ${input.note.trim()}`,
        });
      } else {
        messages.push({
          role: 'user',
          content: 'I rejected the proposed changes. Please acknowledge briefly.',
        });
      }
    }

    const response = await finalizeText(env, messages, cardEvents, complete);
    if (input.decision === 'reject' && response.type !== 'text') {
      // Reject should not surface mutating cards; keep any read-only cards.
      const readOnlyEvents = cardEvents.filter(
        (e) => !isMutatingTool(e.toolName),
      );
      const card = aggregateCard(readOnlyEvents);
      response.type = card.type;
      response.data = card.data;
    }

    await insertMessage(db, {
      userId: input.userId,
      sessionId: input.sessionId,
      role: 'assistant',
      content: response.message,
      responseType: response.type,
      cardData:
        Object.keys(response.data).length > 0 ? response.data : undefined,
    });
    await clearPendingInterrupt(db, input.userId, input.sessionId);

    return { kind: 'complete', response };
  } catch (error) {
    await releaseSessionLock(db, input.userId, input.sessionId).catch(
      () => undefined,
    );
    const message =
      error instanceof Error ? error.message : 'Resume failed';
    return { kind: 'error', message };
  }
}
