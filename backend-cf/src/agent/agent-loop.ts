import type { Env } from '../env';
import {
  claimPendingInterrupt,
  finishHitlCheckpoint,
  HITL_PENDING_TTL_SECONDS,
  getPendingInterrupt,
  getRecentMessagesForModel,
  getSessionForUser,
  insertHitlOutcomeMessage,
  insertMessage,
  interruptIdOf,
  isPendingExpired,
  parseHitlCheckpoint,
  reclaimStaleHitlClaim,
  releaseSessionLock,
  saveHitlResultsAndClearPending,
  setPendingInterrupt,
  tryAcquireSessionLock,
  type HitlCheckpoint,
  type HitlToolResult,
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
import {
  buildCookingAssistantSystemPrompt,
  resolveTodayLocalDate,
} from './system-prompt';
import { COOKING_TOOLS, cookingToolsForGuest } from './tools/definitions';
import { GUEST_TOOL_ALLOWLIST, isGuestAllowedTool } from './tools/guest-allowlist';
import { aggregateCard, type ToolCardEvent } from './tools/cards';
import { executeTool, type ToolExecResult } from './tools/execute';
import { isMutatingTool, toPendingTools } from './tools/hitl';
import { validateToolArgs } from './tools/validate-args';
import { recheckMutatingTargets } from './tools/recheck-targets';
import { ErrorCodes } from '../lib/error-codes';
import {
  looksLikeMutatingUserRequest,
  MUTATION_NO_TOOL_FALLBACK,
  MUTATION_TOOL_NUDGE,
} from './tools/mutating-intent';
import { isGuestUserRow } from '../db/guests';

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
        interruptId: string;
        expiresAt: number;
        pendingTools: PendingInterrupt['pendingTools'];
      };
    }
  | { kind: 'busy'; message: string }
  | { kind: 'quota'; message: string }
  | { kind: 'error'; message: string; status?: number; code?: string };

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
): Promise<HitlToolResult[]> {
  const run = options?.execute ?? executeTool;
  const saved: HitlToolResult[] = [];
  for (const tc of toolCalls) {
    if (options?.skipMutating && isMutatingTool(tc.name)) {
      const content = JSON.stringify({
        skipped: true,
        reason: 'User rejected this action',
      });
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.name,
        content,
      });
      saved.push({ id: tc.id, name: tc.name, content });
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
    saved.push({
      id: tc.id,
      name: tc.name,
      content: result.content,
      ...(result.cardType ? { cardType: result.cardType } : {}),
      ...(result.cardData ? { cardData: result.cardData } : {}),
    });
  }
  return saved;
}

// note: appendToolResults uses options.execute when provided via runToolLoop

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
  options: { isGuest?: boolean } = {},
): Promise<AgentTurnResult> {
  const cardEvents: ToolCardEvent[] = [];
  const maxRounds = recursionLimit(env);
  let mutationNudgeUsed = false;
  let toolChoice: 'auto' | 'required' = 'auto';
  const mutatingIntent = looksLikeMutatingUserRequest(originalUserMessage);
  const tools = options.isGuest
    ? cookingToolsForGuest(GUEST_TOOL_ALLOWLIST)
    : COOKING_TOOLS;
  const runExecute: ExecuteToolFn = async (database, uid, name, args) => {
    if (options.isGuest && !isGuestAllowedTool(name)) {
      return {
        content: JSON.stringify({
          error: 'signup_required',
          message:
            'Sign up to save your kitchen and use planning, shopping, or other advanced tools.',
        }),
      };
    }
    return execute(database, uid, name, args);
  };

  for (let round = 0; round < maxRounds; round++) {
    const result = await complete({
      env,
      messages,
      tools,
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
      const createdAt = nowUnixSeconds();
      const pending: PendingInterrupt = {
        createdAt,
        interruptId: crypto.randomUUID(),
        expiresAt: createdAt + HITL_PENDING_TTL_SECONDS,
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
          interruptId: interruptIdOf(pending),
          expiresAt: pending.expiresAt ?? createdAt + HITL_PENDING_TTL_SECONDS,
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
      { execute: runExecute },
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
    /** Client local calendar date YYYY-MM-DD; UTC fallback if missing/invalid. */
    clientLocalDate?: string;
    /** When false, skip quota increment (not used for resume). */
    chargeQuota?: boolean;
    isGuest?: boolean;
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
    if (isPendingExpired(existingPending)) {
      const dismissed = await dismissExpiredPending(
        env,
        input.userId,
        input.sessionId,
        existingPending,
      );
      if (!dismissed) {
        return {
          kind: 'busy',
          message:
            'There is a pending action waiting for your approval. Approve or reject it first.',
        };
      }
    } else {
      return {
        kind: 'busy',
        message:
          'There is a pending action waiting for your approval. Approve or reject it first.',
      };
    }
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
    const user = await findUserById(db, input.userId);
    const isGuest =
      input.isGuest === true || isGuestUserRow(user ?? null);

    if (chargeQuota) {
      const entitlement = await resolveEntitlement(
        db,
        input.userId,
        user?.role,
      );
      try {
        await checkAndIncrementAiMessage(db, input.userId, {
          isPro: entitlement.isPro,
          isAdmin: entitlement.isAdmin,
          isGuest,
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
    const todayLocalDate = resolveTodayLocalDate(input.clientLocalDate);
    const messages: LlmMessage[] = [
      {
        role: 'system',
        content: buildCookingAssistantSystemPrompt({ todayLocalDate }),
      },
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
      { isGuest },
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
    } else if (turn.kind === 'interrupt') {
      await insertMessage(db, {
        userId: input.userId,
        sessionId: input.sessionId,
        role: 'assistant',
        content: turn.message,
        responseType: 'interrupt',
        cardData: {
          sessionId: turn.data.sessionId,
          pendingTools: turn.data.pendingTools,
        },
      });
      // interrupt: keep lock + pending
    }

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

const EXPIRED_MESSAGE =
  'That approval expired, so I did not make the changes.';
const INTERRUPTED_MESSAGE =
  'That approval was interrupted before it finished. I did not run it again. Check your kitchen and ask again if something is missing.';

function fallbackFromResults(
  decision: HitlCheckpoint['decision'],
  interruptId: string,
  toolResults: HitlToolResult[],
): ChatResponsePayload {
  if (decision === 'expire') {
    return {
      type: 'text',
      message: EXPIRED_MESSAGE,
      data: { expired: true, interruptId },
    };
  }
  if (decision === 'reject') {
    return {
      type: 'text',
      message: 'I did not make those changes.',
      data: { interruptId },
    };
  }
  const cardEvents: ToolCardEvent[] = toolResults
    .filter((result) => result.cardType)
    .map((result) => ({
      toolName: result.name,
      cardType: result.cardType as string,
      data: result.cardData ?? {},
    }));
  const card = aggregateCard(cardEvents);
  const detail = toolResults
    .map((result) => result.content)
    .filter(Boolean)
    .join('\n')
    .slice(0, 1500);
  return {
    type: card.type,
    message: detail
      ? `I applied the approved changes, but could not write a summary. ${detail}`
      : 'I applied the approved changes, but could not write a summary.',
    data: { ...card.data, interruptId },
  };
}

function outcomeFromCheckpoint(checkpoint: HitlCheckpoint): AgentTurnResult {
  if (!checkpoint.response || checkpoint.httpStatus >= 400) {
    return {
      kind: 'error',
      message: checkpoint.response?.message ?? 'Resume failed',
      status: checkpoint.httpStatus || 500,
      code: checkpoint.errorCode ?? ErrorCodes.ERROR,
    };
  }
  return { kind: 'complete', response: checkpoint.response };
}

function checkpointAllows(
  requested: string | undefined,
  checkpoint: HitlCheckpoint,
): boolean {
  if (!requested) return true;
  return requested === checkpoint.interruptId;
}

async function persistResumeOutcome(
  db: D1Database,
  input: { userId: string; sessionId: string },
  claimToken: string,
  checkpoint: HitlCheckpoint,
): Promise<void> {
  const saved: HitlCheckpoint = { ...checkpoint, phase: 'results_saved' };
  await saveHitlResultsAndClearPending(
    db,
    input.userId,
    input.sessionId,
    claimToken,
    saved,
  );
  if (checkpoint.response) {
    await insertHitlOutcomeMessage(db, {
      interruptId: checkpoint.interruptId,
      userId: input.userId,
      sessionId: input.sessionId,
      content: checkpoint.response.message,
      responseType: checkpoint.response.type,
      cardData:
        Object.keys(checkpoint.response.data).length > 0
          ? checkpoint.response.data
          : undefined,
    });
  }
  await finishHitlCheckpoint(db, input.userId, input.sessionId, claimToken, {
    ...checkpoint,
    phase: 'complete',
  });
}

async function dismissExpiredPending(
  env: Env,
  userId: string,
  sessionId: string,
  pending: PendingInterrupt,
): Promise<boolean> {
  const token = crypto.randomUUID();
  const claimed = await claimPendingInterrupt(env.DB, userId, sessionId, token);
  if (!claimed) return false;
  const interruptId = interruptIdOf(pending);
  const response = fallbackFromResults('expire', interruptId, []);
  await persistResumeOutcome(env.DB, { userId, sessionId }, token, {
    interruptId,
    phase: 'complete',
    decision: 'expire',
    toolResults: [],
    httpStatus: 200,
    response,
  });
  return true;
}

export async function resumeAgentTurn(
  env: Env,
  input: {
    userId: string;
    sessionId: string;
    decision: 'approve' | 'reject';
    note?: string;
    interruptId?: string;
  },
  deps?: AgentDeps,
): Promise<AgentTurnResult> {
  const db = env.DB;
  const complete = deps?.completeChat ?? completeChat;
  const execute = deps?.executeTool ?? executeTool;
  const requested = input.interruptId?.trim() || undefined;

  const session = await getSessionForUser(db, input.userId, input.sessionId);
  if (!session) {
    return {
      kind: 'error',
      message: 'Session not found',
      status: 404,
      code: ErrorCodes.NOT_FOUND,
    };
  }

  const pending = await getPendingInterrupt(db, input.userId, input.sessionId);
  const checkpoint = parseHitlCheckpoint(session.hitl_checkpoint_json);

  if (pending && requested && requested !== interruptIdOf(pending)) {
    return {
      kind: 'error',
      message: 'interruptId does not match the pending action',
      status: 409,
      code: ErrorCodes.INTERRUPT_MISMATCH,
    };
  }

  if (!pending) {
    if (checkpoint?.phase === 'complete' && checkpointAllows(requested, checkpoint)) {
      return outcomeFromCheckpoint(checkpoint);
    }
    if (checkpoint && requested && requested !== checkpoint.interruptId) {
      return {
        kind: 'error',
        message: 'interruptId does not match the pending action',
        status: 409,
        code: ErrorCodes.INTERRUPT_MISMATCH,
      };
    }
    if (checkpoint?.phase === 'results_saved') {
      const token = crypto.randomUUID();
      const reclaimed = await reclaimStaleHitlClaim(
        db,
        input.userId,
        input.sessionId,
        token,
      );
      if (!reclaimed) {
        return {
          kind: 'error',
          message: 'This approval is already being applied.',
          status: 409,
          code: ErrorCodes.RESUME_IN_PROGRESS,
        };
      }
      const response = fallbackFromResults(
        checkpoint.decision,
        checkpoint.interruptId,
        checkpoint.toolResults ?? [],
      );
      const done: HitlCheckpoint = {
        ...checkpoint,
        phase: 'complete',
        httpStatus: 200,
        response,
      };
      await insertHitlOutcomeMessage(db, {
        interruptId: checkpoint.interruptId,
        userId: input.userId,
        sessionId: input.sessionId,
        content: response.message,
        responseType: response.type,
        cardData: response.data,
      });
      await finishHitlCheckpoint(db, input.userId, input.sessionId, token, done);
      return { kind: 'complete', response };
    }
    return {
      kind: 'error',
      message: 'No pending action to resume',
      status: 404,
      code: ErrorCodes.NO_PENDING_ACTION,
    };
  }

  const claimToken = crypto.randomUUID();
  const claimed = await claimPendingInterrupt(
    db,
    input.userId,
    input.sessionId,
    claimToken,
  );
  if (!claimed) {
    const again = await getSessionForUser(db, input.userId, input.sessionId);
    const againCheckpoint = parseHitlCheckpoint(again?.hitl_checkpoint_json);
    if (
      againCheckpoint?.phase === 'complete' &&
      checkpointAllows(requested, againCheckpoint)
    ) {
      return outcomeFromCheckpoint(againCheckpoint);
    }
    const lockedAt = again?.locked_at ?? null;
    const stale =
      lockedAt != null &&
      lockedAt < nowUnixSeconds() - 90 &&
      again?.pending_claim_token;
    if (stale) {
      const token = crypto.randomUUID();
      const reclaimed = await reclaimStaleHitlClaim(
        db,
        input.userId,
        input.sessionId,
        token,
      );
      if (reclaimed) {
        const interruptId = interruptIdOf(pending);
        const response = {
          type: 'text',
          message: INTERRUPTED_MESSAGE,
          data: { interruptId },
        };
        await persistResumeOutcome(db, input, token, {
          interruptId,
          phase: 'complete',
          decision: 'reject',
          toolResults: [],
          httpStatus: 200,
          response,
        });
        return { kind: 'complete', response };
      }
    }
    return {
      kind: 'error',
      message: 'This approval is already being applied.',
      status: 409,
      code: ErrorCodes.RESUME_IN_PROGRESS,
    };
  }

  const interruptId = interruptIdOf(pending);
  const expired = isPendingExpired(pending);
  const decision: HitlCheckpoint['decision'] = expired
    ? 'expire'
    : input.decision;

  const toolCalls: ParsedToolCall[] = pending.toolCalls.map((tc) => ({
    id: tc.id,
    name: tc.name,
    arguments: tc.arguments,
  }));

  if (decision === 'approve') {
    const argErrors = toolCalls.flatMap((tc) =>
      validateToolArgs(tc.name, tc.arguments),
    );
    if (argErrors.length) {
      const message = argErrors.slice(0, 5).join('; ');
      const response = { type: 'text', message, data: { interruptId } };
      await persistResumeOutcome(db, input, claimToken, {
        interruptId,
        phase: 'complete',
        decision: 'reject',
        toolResults: [],
        httpStatus: 400,
        errorCode: ErrorCodes.TOOL_ARGS_INVALID,
        response,
      });
      return {
        kind: 'error',
        message,
        status: 400,
        code: ErrorCodes.TOOL_ARGS_INVALID,
      };
    }
    const missing = await recheckMutatingTargets(db, input.userId, toolCalls);
    if (missing.length) {
      const message =
        'Some items are no longer available, so nothing was changed.';
      const response = {
        type: 'text',
        message,
        data: { interruptId, missing },
      };
      await persistResumeOutcome(db, input, claimToken, {
        interruptId,
        phase: 'complete',
        decision: 'reject',
        toolResults: [],
        httpStatus: 409,
        errorCode: ErrorCodes.TARGET_MISSING,
        response,
      });
      return {
        kind: 'error',
        message,
        status: 409,
        code: ErrorCodes.TARGET_MISSING,
      };
    }
  }

  if (decision === 'expire') {
    const response = fallbackFromResults('expire', interruptId, []);
    await persistResumeOutcome(db, input, claimToken, {
      interruptId,
      phase: 'complete',
      decision: 'expire',
      toolResults: [],
      httpStatus: 200,
      response,
    });
    return { kind: 'complete', response };
  }

  const messages = pendingToMessages(pending.messages);
  const cardEvents: ToolCardEvent[] = [];
  let toolResults: HitlToolResult[] = [];
  try {
    if (decision === 'approve') {
      toolResults = await appendToolResults(
        db,
        input.userId,
        messages,
        toolCalls,
        cardEvents,
        { execute },
      );
    } else {
      toolResults = await appendToolResults(
        db,
        input.userId,
        messages,
        toolCalls,
        cardEvents,
        { skipMutating: true, execute },
      );
      messages.push({
        role: 'user',
        content: input.note?.trim()
          ? `I rejected the proposed changes. Note: ${input.note.trim()}`
          : 'I rejected the proposed changes. Please acknowledge briefly.',
      });
    }

    const partial: HitlCheckpoint = {
      interruptId,
      phase: 'results_saved',
      decision,
      toolResults,
      httpStatus: 200,
    };
    await saveHitlResultsAndClearPending(
      db,
      input.userId,
      input.sessionId,
      claimToken,
      partial,
    );

    let response: ChatResponsePayload;
    try {
      response = await finalizeText(env, messages, cardEvents, complete);
      if (decision === 'reject' && response.type !== 'text') {
        const readOnlyEvents = cardEvents.filter(
          (event) => !isMutatingTool(event.toolName),
        );
        const card = aggregateCard(readOnlyEvents);
        response.type = card.type;
        response.data = card.data;
      }
    } catch {
      response = fallbackFromResults(decision, interruptId, toolResults);
    }

    await insertHitlOutcomeMessage(db, {
      interruptId,
      userId: input.userId,
      sessionId: input.sessionId,
      content: response.message,
      responseType: response.type,
      cardData:
        Object.keys(response.data).length > 0 ? response.data : undefined,
    });
    await finishHitlCheckpoint(db, input.userId, input.sessionId, claimToken, {
      ...partial,
      phase: 'complete',
      httpStatus: 200,
      response,
    });
    return { kind: 'complete', response };
  } catch (error) {
    await releaseSessionLock(db, input.userId, input.sessionId).catch(
      () => undefined,
    );
    const message = error instanceof Error ? error.message : 'Resume failed';
    return { kind: 'error', message, status: 500, code: ErrorCodes.INTERNAL };
  }
}
