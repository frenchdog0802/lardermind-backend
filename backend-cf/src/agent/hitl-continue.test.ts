import { describe, expect, it } from 'vitest';
import {
  resumeAgentTurn,
  type CompleteChatFn,
  type ExecuteToolFn,
} from './agent-loop';
import type { Env } from '../env';
import { recheckMutatingTargets } from './tools/recheck-targets';
import { normalizeToolCallArgs } from './tools/normalize-args';
import { argsSummary } from './tools/hitl';

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

function sessionDb(pending: Record<string, unknown>) {
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
          if (sql.includes('SET pending_interrupt_json = ?, locked_at = ?')) {
            session.pending_interrupt_json = String(bound[0]);
            return { meta: { changes: 1 } };
          }
          if (
            sql.includes('pending_interrupt_json = NULL') &&
            sql.includes('hitl_checkpoint_json')
          ) {
            if (session.pending_claim_token !== bound[5]) return { meta: { changes: 0 } };
            session.hitl_checkpoint_json = String(bound[0]);
            session.pending_interrupt_json = null;
            return { meta: { changes: 1 } };
          }
          if (
            sql.includes('pending_claim_token = NULL') &&
            sql.includes('hitl_checkpoint_json')
          ) {
            if (session.pending_claim_token !== bound[4]) return { meta: { changes: 0 } };
            session.hitl_checkpoint_json = String(bound[0]);
            session.pending_claim_token = null;
            session.locked_at = null;
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

const createRecipePending = {
  createdAt: Math.floor(Date.now() / 1000),
  interruptId: 'int-1',
  expiresAt: Math.floor(Date.now() / 1000) + 20 * 60,
  pendingTools: [{ name: 'createRecipe', argsSummary: 'Soup', id: 'c1' }],
  toolCalls: [
    {
      id: 'c1',
      name: 'createRecipe',
      arguments: { meal_name: 'Soup', ingredients: [] },
    },
  ],
  messages: [
    { role: 'user', content: 'plan 3 dinners' },
    { role: 'assistant', content: null, tool_calls: [] },
  ],
};

const execute: ExecuteToolFn = async () => ({
  content: JSON.stringify({ recipe: { id: 'r1', meal_name: 'Soup' } }),
  cardType: 'recipe_created',
  cardData: { recipeId: 'r1', recipeName: 'Soup' },
});

describe('multi-step planning continues after approval', () => {
  it('stops at a fresh planMeals approval (HITL kept) instead of running out of turn', async () => {
    const { db, session } = sessionDb(createRecipePending);
    let calls = 0;
    const complete: CompleteChatFn = async () => {
      calls += 1;
      return {
        content: 'Recipes saved. Scheduling them now.',
        toolCalls: [
          {
            id: 'c2',
            name: 'planMeals',
            arguments: {
              meals: [
                { meal_name: 'Soup', meal_type: 'dinner', serving_date: '2026-11-20' },
              ],
            },
          },
        ],
        rawAssistantMessage: { role: 'assistant', content: null, tool_calls: [] },
      };
    };

    const result = await resumeAgentTurn(
      { DB: db } as Env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'int-1' },
      { completeChat: complete, executeTool: execute },
    );

    expect(calls).toBe(1);
    expect(result.kind).toBe('complete');
    if (result.kind !== 'complete') return;
    expect(result.response.type).toBe('interrupt');
    expect(result.response.message).toBe('Recipes saved. Scheduling them now.');
    const data = result.response.data as {
      interruptId: string;
      pendingTools: Array<{ name: string }>;
      priorCard?: { type: string };
    };
    expect(data.pendingTools.map((t) => t.name)).toEqual(['planMeals']);
    expect(data.interruptId).not.toBe('int-1');
    expect(data.priorCard?.type).toBe('recipe_created');

    // planMeals was NOT executed: it is stored as the new pending action.
    const stored = JSON.parse(session.pending_interrupt_json ?? 'null');
    expect(stored.interruptId).toBe(data.interruptId);
    expect(stored.toolCalls[0].name).toBe('planMeals');
    // Claim released so the new approval can be claimed.
    expect(session.pending_claim_token).toBeNull();
  });

  it('completes normally when the model has nothing else to do', async () => {
    const { db, session } = sessionDb(createRecipePending);
    const complete: CompleteChatFn = async () => ({
      content: 'Saved the recipe.',
      toolCalls: [],
      rawAssistantMessage: { role: 'assistant', content: 'Saved the recipe.' },
    });
    const result = await resumeAgentTurn(
      { DB: db } as Env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'int-1' },
      { completeChat: complete, executeTool: execute },
    );
    expect(result).toMatchObject({
      kind: 'complete',
      response: { type: 'recipe_created', message: 'Saved the recipe.' },
    });
    expect(session.pending_interrupt_json).toBeNull();
  });

  it('read-only follow-up tools run inline before the next approval', async () => {
    const { db } = sessionDb(createRecipePending);
    const ran: string[] = [];
    const exec: ExecuteToolFn = async (_d, _u, name) => {
      ran.push(name);
      return { content: '{}' };
    };
    let n = 0;
    const complete: CompleteChatFn = async () => {
      n += 1;
      if (n === 1) {
        return {
          content: '',
          toolCalls: [{ id: 'c2', name: 'listMyRecipes', arguments: {} }],
          rawAssistantMessage: { role: 'assistant', content: null, tool_calls: [] },
        };
      }
      return {
        content: 'All set.',
        toolCalls: [],
        rawAssistantMessage: { role: 'assistant', content: 'All set.' },
      };
    };
    const result = await resumeAgentTurn(
      { DB: db } as Env,
      { userId: 'u1', sessionId: 's1', decision: 'approve', interruptId: 'int-1' },
      { completeChat: complete, executeTool: exec },
    );
    expect(ran).toContain('listMyRecipes');
    expect(result.kind).toBe('complete');
  });
});

function nullDb(rows: { pantry?: Record<string, unknown> | null } = {}) {
  return {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return rows.pantry ?? null;
        },
        async all() {
          return { results: rows.pantry ? [rows.pantry] : [] };
        },
        async run() {
          return { meta: { changes: 0 } };
        },
      };
    },
  } as unknown as D1Database;
}

describe('recheck does not false-fail planMeals', () => {
  it('passes a slot whose recipe_id is stale when meal_name is present', async () => {
    const missing = await recheckMutatingTargets(nullDb(), 'u1', [
      {
        name: 'planMeals',
        arguments: {
          meals: [
            {
              meal_name: 'Soup',
              meal_type: 'dinner',
              serving_date: '2026-11-20',
              recipe_id: 'gone',
            },
          ],
        },
      },
    ]);
    expect(missing).toEqual([]);
  });

  it('passes recipe ids that a createRecipe in the same batch will create', async () => {
    const missing = await recheckMutatingTargets(nullDb(), 'u1', [
      { name: 'createRecipe', arguments: { meal_name: 'Soup' } },
      {
        name: 'addRecipeToMenu',
        arguments: { recipe_id: 'future', meal_type: 'dinner', serving_date: '2026-11-20' },
      },
    ]);
    expect(missing).toEqual([]);
  });

  it('still flags a recipe id with no name and nothing creating it', async () => {
    const missing = await recheckMutatingTargets(nullDb(), 'u1', [
      {
        name: 'addRecipeToMenu',
        arguments: { recipe_id: 'gone', meal_type: 'dinner', serving_date: '2026-11-20' },
      },
    ]);
    expect(missing).toEqual([{ tool: 'addRecipeToMenu', id: 'gone' }]);
  });
});

describe('normalizeToolCallArgs (approval card payload)', () => {
  it('maps invented units onto app units before the card is built', async () => {
    const [call] = await normalizeToolCallArgs(nullDb(), 'u1', [
      {
        name: 'addPantryItems',
        arguments: {
          items: [
            { name: 'milk', quantity: 1, unit: 'carton' },
            { name: 'bread', quantity: 1, unit: 'loaf' },
            { name: 'eggs', quantity: 12 },
          ],
        },
      },
    ]);
    const items = (call!.arguments.items as Array<{ unit: string }>).map((i) => i.unit);
    expect(items).toEqual(['l', 'pcs', 'pcs']);
  });

  it('a pantry quantity update without unit inherits the row unit, so the card shows it', async () => {
    const [call] = await normalizeToolCallArgs(
      nullDb({
        pantry: {
          id: 'p1',
          user_id: 'u1',
          name: 'cheese',
          quantity: '100',
          unit: 'g',
          notes: null,
          ingredient_id: null,
          created_at: 1,
          updated_at: 1,
        },
      }),
      'u1',
      [{ name: 'updatePantryItems', arguments: { items: [{ name: 'cheese', quantity: 200 }] } }],
    );
    expect(argsSummary('updatePantryItems', call!.arguments)).toBe('cheese → 200 g');
  });
});
