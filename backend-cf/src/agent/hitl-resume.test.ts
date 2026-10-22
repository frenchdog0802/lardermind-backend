import { describe, expect, it } from 'vitest';
import {
  resumeAgentTurn,
  type CompleteChatFn,
  type ExecuteToolFn,
} from './agent-loop';
import type { Env } from '../env';
import type { HitlCheckpoint } from '../db/chat';

type Session = {
  id: string;
  user_id: string;
  title: string;
  is_default: number;
  created_at: number;
  updated_at: number;
  locked_at: number | null;
  pending_interrupt_json: string | null;
  pending_claim_token: string | null;
  hitl_checkpoint_json: string | null;
};

function hitlDb(pending: Record<string, unknown>) {
  const session: Session = {
    id: 's1',
    user_id: 'u1',
    title: 'Chat',
    is_default: 0,
    created_at: 1,
    updated_at: 1,
    locked_at: 1,
    pending_interrupt_json: JSON.stringify(pending),
    pending_claim_token: null,
    hitl_checkpoint_json: null,
  };

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      const stmt = {
        bind(...args: unknown[]) {
          bound = args;
          return stmt;
        },
        async first<T>() {
          if (sql.includes('FROM chat_sessions')) return session as T;
          return null;
        },
        async run() {
          if (
            sql.includes('pending_claim_token = ?') &&
            sql.includes('pending_interrupt_json IS NOT NULL') &&
            sql.includes('pending_claim_token IS NULL')
          ) {
            if (session.pending_interrupt_json && !session.pending_claim_token) {
              session.pending_claim_token = String(bound[0]);
              session.locked_at = Number(bound[1]);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.includes('pending_interrupt_json = NULL') && sql.includes('hitl_checkpoint_json')) {
            if (session.pending_claim_token !== bound[5]) return { meta: { changes: 0 } };
            session.hitl_checkpoint_json = String(bound[0]);
            session.pending_interrupt_json = null;
            session.locked_at = Number(bound[1]);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('pending_claim_token = NULL') && sql.includes('hitl_checkpoint_json')) {
            if (session.pending_claim_token !== bound[4]) return { meta: { changes: 0 } };
            session.hitl_checkpoint_json = String(bound[0]);
            session.pending_claim_token = null;
            session.locked_at = null;
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT OR IGNORE INTO ai_messages')) {
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
  };

  return { db: db as unknown as D1Database, session };
}

function pending(overrides: Record<string, unknown> = {}) {
  return {
    createdAt: Math.floor(Date.now() / 1000),
    interruptId: 'int-1',
    expiresAt: Math.floor(Date.now() / 1000) + 20 * 60,
    pendingTools: [{ name: 'addPantryItems', argsSummary: 'butter', id: 'c1' }],
    toolCalls: [
      {
        id: 'c1',
        name: 'addPantryItems',
        arguments: { items: [{ name: 'butter', quantity: 1, unit: 'pcs' }] },
      },
    ],
    messages: [
      { role: 'user', content: 'add butter' },
      { role: 'assistant', content: null, tool_calls: [] },
    ],
    ...overrides,
  };
}

const completeOk: CompleteChatFn = async () => ({
  content: 'Added butter.',
  toolCalls: [],
  rawAssistantMessage: { role: 'assistant', content: 'Added butter.' },
});

describe('HITL resume single execution', () => {
  it('runs a double approval once and replays the outcome', async () => {
    const { db, session } = hitlDb(pending());
    const env = { DB: db } as Env;
    let runs = 0;
    const execute: ExecuteToolFn = async () => {
      runs += 1;
      await Promise.resolve();
      return {
        content: JSON.stringify({ ok: true }),
        cardType: 'pantry_updated',
        cardData: { items: [{ name: 'butter' }] },
      };
    };

    const [first, second] = await Promise.all([
      resumeAgentTurn(
        env,
        { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'int-1' },
        { completeChat: completeOk, executeTool: execute },
      ),
      resumeAgentTurn(
        env,
        { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'int-1' },
        { completeChat: completeOk, executeTool: execute },
      ),
    ]);

    expect(runs).toBe(1);
    const kinds = [first.kind, second.kind].sort();
    expect(kinds).toContain('complete');
    expect(session.pending_interrupt_json).toBeNull();

    const replay = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'int-1' },
      { completeChat: completeOk, executeTool: execute },
    );
    expect(replay.kind).toBe('complete');
    expect(runs).toBe(1);
    if (replay.kind === 'complete') {
      expect(replay.response.message.length).toBeGreaterThan(0);
    }
  });

  it('does not execute again when the reply step throws', async () => {
    const { db, session } = hitlDb(pending());
    const env = { DB: db } as Env;
    let runs = 0;
    const execute: ExecuteToolFn = async () => {
      runs += 1;
      return { content: JSON.stringify({ ok: true }), cardType: 'pantry_updated', cardData: {} };
    };
    const complete: CompleteChatFn = async () => {
      throw new Error('llm down');
    };

    const first = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve' },
      { completeChat: complete, executeTool: execute },
    );
    expect(first.kind).toBe('complete');
    expect(runs).toBe(1);
    expect(session.pending_interrupt_json).toBeNull();
    if (first.kind === 'complete') {
      expect(first.response.message).toMatch(/applied the approved changes/i);
    }

    const second = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve' },
      { completeChat: complete, executeTool: execute },
    );
    expect(second.kind).toBe('complete');
    expect(runs).toBe(1);
  });

  it('treats an expired approval as rejected and does not run tools', async () => {
    const { db } = hitlDb(
      pending({
        createdAt: 10,
        expiresAt: 10,
        interruptId: 'old-1',
      }),
    );
    const env = { DB: db } as Env;
    let runs = 0;
    const execute: ExecuteToolFn = async () => {
      runs += 1;
      return { content: '{}', cardType: 'pantry_updated', cardData: {} };
    };

    const first = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'old-1' },
      { executeTool: execute, completeChat: completeOk },
    );
    expect(runs).toBe(0);
    expect(first.kind).toBe('complete');
    if (first.kind === 'complete') {
      expect(first.response.message).toMatch(/expired/i);
      expect(first.response.data.expired).toBe(true);
    }

    const second = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'old-1' },
      { executeTool: execute, completeChat: completeOk },
    );
    expect(runs).toBe(0);
    expect(second).toMatchObject({ kind: 'complete' });
  });

  it('returns 409 when interruptId does not match and leaves the action pending', async () => {
    const { db, session } = hitlDb(pending());
    const env = { DB: db } as Env;
    let runs = 0;
    const execute: ExecuteToolFn = async () => {
      runs += 1;
      return { content: '{}' };
    };
    const turn = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'other' },
      { executeTool: execute, completeChat: completeOk },
    );
    expect(turn).toMatchObject({
      kind: 'error',
      status: 409,
      code: 'interrupt_mismatch',
    });
    expect(runs).toBe(0);
    expect(session.pending_interrupt_json).toBeTruthy();
    const stored = JSON.parse(session.pending_interrupt_json ?? '{}') as HitlCheckpoint;
    expect(stored).toMatchObject({ interruptId: 'int-1' });
  });

  it('rejects invalid tool arguments without executing', async () => {
    const { db } = hitlDb(
      pending({
        toolCalls: [{ id: 'c1', name: 'addPantryItems', arguments: {} }],
      }),
    );
    const env = { DB: db } as Env;
    let runs = 0;
    const turn = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve' },
      {
        executeTool: async () => {
          runs += 1;
          return { content: '{}' };
        },
        completeChat: completeOk,
      },
    );
    expect(runs).toBe(0);
    expect(turn).toMatchObject({ kind: 'error', status: 400, code: 'tool_args_invalid' });
  });

  it('does not execute when a targeted pantry row is gone', async () => {
    const { db } = hitlDb(
      pending({
        pendingTools: [{ name: 'updatePantryItems', argsSummary: 'gone', id: 'c1' }],
        toolCalls: [
          {
            id: 'c1',
            name: 'updatePantryItems',
            arguments: {
              items: [{ pantry_item_id: 'missing', quantity: 1, mode: 'set' }],
            },
          },
        ],
      }),
    );
    const env = { DB: db } as Env;
    let runs = 0;
    const turn = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve' },
      {
        executeTool: async () => {
          runs += 1;
          return { content: '{}' };
        },
        completeChat: completeOk,
      },
    );
    expect(runs).toBe(0);
    expect(turn).toMatchObject({ kind: 'error', status: 409, code: 'target_missing' });
  });
});
