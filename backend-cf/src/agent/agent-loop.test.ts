import { describe, expect, it } from 'vitest';
import { parseToolCallsFromMessage } from '../lib/llm-chat';
import {
  runAgentTurn,
  resumeAgentTurn,
  type CompleteChatFn,
  type ExecuteToolFn,
} from './agent-loop';
import type { Env } from '../env';

function mockDb(state: {
  pending?: string | null;
  lockedAt?: number | null;
  messages?: Array<{ role: string; content: string }>;
}) {
  const pantry: Array<{
    id: string;
    user_id: string;
    name: string;
    quantity: string;
    unit: string;
    notes: string | null;
    ingredient_id: string | null;
    created_at: number;
    updated_at: number;
  }> = [
    {
      id: 'p1',
      user_id: 'u1',
      name: 'eggs',
      quantity: '6',
      unit: 'pcs',
      notes: null,
      ingredient_id: null,
      created_at: 1,
      updated_at: 1,
    },
  ];

  const session = {
    id: 's1',
    user_id: 'u1',
    title: 'Chat',
    is_default: 0,
    created_at: 1,
    updated_at: 1,
    locked_at: state.lockedAt ?? null,
    pending_interrupt_json: state.pending ?? null,
  };

  const messages = state.messages ?? [];

  const db = {
    prepare(sql: string) {
      const stmt = {
        bind(..._args: unknown[]) {
          return stmt;
        },
        async first<T>() {
          if (sql.includes('FROM chat_sessions')) {
            return session as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM pantry_items')) {
            return { results: pantry as T[] };
          }
          if (sql.includes('FROM ai_messages') && sql.includes('LIMIT')) {
            return {
              results: [...messages].reverse().slice(0, 12) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('SET locked_at') && sql.includes('locked_at IS NULL')) {
            if (session.locked_at != null) {
              return { meta: { changes: 0 } };
            }
            session.locked_at = 1;
            return { meta: { changes: 1 } };
          }
          if (sql.includes('pending_interrupt_json = NULL')) {
            session.pending_interrupt_json = null;
            session.locked_at = null;
            return { meta: { changes: 1 } };
          }
          if (sql.includes('SET pending_interrupt_json')) {
            return { meta: { changes: 1 } };
          }
          if (sql.includes('SET locked_at = NULL')) {
            session.locked_at = null;
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 1 } };
        },
      };
      return stmt;
    },
    async batch(stmts: Array<{ run: () => Promise<unknown> }>) {
      for (const s of stmts) await s.run();
    },
  };

  return { db: db as unknown as D1Database, session, pantry, messages };
}

describe('parseToolCallsFromMessage', () => {
  it('parses OpenAI-style tool_calls', () => {
    const parsed = parseToolCallsFromMessage({
      tool_calls: [
        {
          id: 'call_1',
          function: {
            name: 'listPantry',
            arguments: '{}',
          },
        },
      ],
    });
    expect(parsed).toEqual([
      { id: 'call_1', name: 'listPantry', arguments: {} },
    ]);
  });
});

describe('agent loop', () => {
  it('interrupts when LLM requests a mutating tool', async () => {
    const { db, session } = mockDb({});
    const env = { DB: db } as Env;

    let pendingSaved: string | null = null;
    const originalPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const stmt = originalPrepare(sql);
      const originalBind = stmt.bind.bind(stmt);
      stmt.bind = (...args: unknown[]) => {
        if (
          sql.includes('SET pending_interrupt_json') &&
          !sql.includes('NULL') &&
          typeof args[0] === 'string'
        ) {
          pendingSaved = args[0];
          session.pending_interrupt_json = args[0];
        }
        return originalBind(...args);
      };
      return stmt;
    }) as typeof db.prepare;

    const complete: CompleteChatFn = async () => ({
      content: '',
      toolCalls: [
        {
          id: 'c1',
          name: 'addPantryItems',
          arguments: { items: [{ name: 'milk', quantity: 1 }] },
        },
      ],
      rawAssistantMessage: {
        role: 'assistant',
        content: null,
        tool_calls: [
          {
            id: 'c1',
            type: 'function',
            function: {
              name: 'addPantryItems',
              arguments: JSON.stringify({
                items: [{ name: 'milk', quantity: 1 }],
              }),
            },
          },
        ],
      },
    });

    const turn = await runAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', message: 'add milk' },
      { completeChat: complete },
    );

    expect(turn.kind).toBe('interrupt');
    if (turn.kind === 'interrupt') {
      expect(turn.data.pendingTools[0]?.name).toBe('addPantryItems');
    }
    expect(pendingSaved).toBeTruthy();
  });

  it('auto-executes listPantry without interrupt', async () => {
    const { db } = mockDb({});
    const env = { DB: db } as Env;
    let round = 0;

    const complete: CompleteChatFn = async () => {
      round += 1;
      if (round === 1) {
        return {
          content: '',
          toolCalls: [{ id: 'c1', name: 'listPantry', arguments: {} }],
          rawAssistantMessage: {
            role: 'assistant',
            content: null,
            tool_calls: [
              {
                id: 'c1',
                type: 'function',
                function: { name: 'listPantry', arguments: '{}' },
              },
            ],
          },
        };
      }
      return {
        content: 'You have eggs in your pantry.',
        toolCalls: [],
        rawAssistantMessage: {
          role: 'assistant',
          content: 'You have eggs in your pantry.',
        },
      };
    };

    const turn = await runAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', message: 'what pantry do i have' },
      { completeChat: complete },
    );

    expect(turn.kind).toBe('complete');
    if (turn.kind === 'complete') {
      expect(turn.response.message).toContain('eggs');
      expect(turn.response.type).toBe('text');
    }
  });

  it('resume approve executes mutating tool; reject skips write', async () => {
    const pending = {
      createdAt: 1,
      pendingTools: [
        { name: 'addPantryItems', argsSummary: 'butter', id: 'c1' },
      ],
      toolCalls: [
        {
          id: 'c1',
          name: 'addPantryItems',
          arguments: { items: [{ name: 'butter', quantity: 1, unit: 'pcs' }] },
        },
      ],
      messages: [
        { role: 'system', content: 'sys' },
        { role: 'user', content: 'add butter' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: {
                name: 'addPantryItems',
                arguments: JSON.stringify({
                  items: [{ name: 'butter', quantity: 1, unit: 'pcs' }],
                }),
              },
            },
          ],
        },
      ],
    };

    const { db, session } = mockDb({
      pending: JSON.stringify(pending),
      lockedAt: 1,
    });
    const env = { DB: db } as Env;

    const originalPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const stmt = originalPrepare(sql);
      const originalBind = stmt.bind.bind(stmt);
      stmt.bind = (...args: unknown[]) => {
        if (sql.includes('pending_interrupt_json = NULL')) {
          session.pending_interrupt_json = null;
          session.locked_at = null;
        }
        return originalBind(...args);
      };
      return stmt;
    }) as typeof db.prepare;

    const executed: string[] = [];
    const execute: ExecuteToolFn = async (_db, _userId, name) => {
      executed.push(name);
      return {
        content: JSON.stringify({ ok: true }),
        cardType: 'pantry_updated',
        cardData: { items: [{ name: 'butter' }] },
      };
    };

    const complete: CompleteChatFn = async () => ({
      content: 'Added butter to your pantry.',
      toolCalls: [],
      rawAssistantMessage: {
        role: 'assistant',
        content: 'Added butter to your pantry.',
      },
    });

    const approved = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'approve' },
      { completeChat: complete, executeTool: execute },
    );
    expect(approved.kind).toBe('complete');
    expect(executed).toEqual(['addPantryItems']);
    if (approved.kind === 'complete') {
      expect(approved.response.type).toBe('pantry_updated');
    }

    session.pending_interrupt_json = JSON.stringify(pending);
    session.locked_at = 1;
    executed.length = 0;

    const rejected = await resumeAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', decision: 'reject' },
      {
        completeChat: async () => ({
          content: 'Okay, I will not add that.',
          toolCalls: [],
          rawAssistantMessage: {
            role: 'assistant',
            content: 'Okay, I will not add that.',
          },
        }),
        executeTool: execute,
      },
    );
    expect(rejected.kind).toBe('complete');
    expect(executed).toEqual([]);
  });

  it('nudges then interrupts when mutation request first returns text-only false success', async () => {
    const { db, session } = mockDb({});
    const env = { DB: db } as Env;
    let pendingSaved: string | null = null;
    const originalPrepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const stmt = originalPrepare(sql);
      const originalBind = stmt.bind.bind(stmt);
      stmt.bind = (...args: unknown[]) => {
        if (
          sql.includes('SET pending_interrupt_json') &&
          !sql.includes('NULL') &&
          typeof args[0] === 'string'
        ) {
          pendingSaved = args[0];
          session.pending_interrupt_json = args[0];
        }
        return originalBind(...args);
      };
      return stmt;
    }) as typeof db.prepare;

    let round = 0;
    const complete: CompleteChatFn = async (input) => {
      round += 1;
      if (round === 1) {
        expect(input.toolChoice === undefined || input.toolChoice === 'auto').toBe(
          true,
        );
        return {
          content:
            '好的，我幫你記下：豬肉 3 份已加入庫存 ✅\n目前你的庫存：\n• 豬肉 × 3 份',
          toolCalls: [],
          rawAssistantMessage: {
            role: 'assistant',
            content:
              '好的，我幫你記下：豬肉 3 份已加入庫存 ✅\n目前你的庫存：\n• 豬肉 × 3 份',
          },
        };
      }
      expect(input.toolChoice).toBe('required');
      return {
        content: '',
        toolCalls: [
          {
            id: 'c1',
            name: 'addPantryItems',
            arguments: {
              items: [{ name: '豬肉', quantity: 3, unit: '份' }],
            },
          },
        ],
        rawAssistantMessage: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'c1',
              type: 'function',
              function: {
                name: 'addPantryItems',
                arguments: JSON.stringify({
                  items: [{ name: '豬肉', quantity: 3, unit: '份' }],
                }),
              },
            },
          ],
        },
      };
    };

    const turn = await runAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', message: '幫我新增三份豬肉到庫存' },
      { completeChat: complete },
    );

    expect(round).toBe(2);
    expect(turn.kind).toBe('interrupt');
    if (turn.kind === 'interrupt') {
      expect(turn.data.pendingTools[0]?.name).toBe('addPantryItems');
    }
    expect(pendingSaved).toBeTruthy();
  });

  it('does not forward hallucinated success when mutation request never yields tools', async () => {
    const { db } = mockDb({});
    const env = { DB: db } as Env;
    const hallucinated =
      '好的，我幫你記下：豬肉 3 份已加入庫存 ✅';

    const complete: CompleteChatFn = async () => ({
      content: hallucinated,
      toolCalls: [],
      rawAssistantMessage: {
        role: 'assistant',
        content: hallucinated,
      },
    });

    const turn = await runAgentTurn(
      env,
      { userId: 'u1', sessionId: 's1', message: '幫我新增三份豬肉到庫存' },
      { completeChat: complete },
    );

    expect(turn.kind).toBe('complete');
    if (turn.kind === 'complete') {
      expect(turn.response.message).not.toBe(hallucinated);
      expect(turn.response.message).toMatch(/Nothing was saved/i);
      expect(turn.response.type).toBe('text');
    }
  });
});
