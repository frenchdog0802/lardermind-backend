// Server-level regression for the 2026-11 "5 dinners, main + side" session:
// real migrations + real SQL, real tool executors, a scripted fake LLM.
import { describe, expect, it } from 'vitest';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { createSession, getPendingInterrupt } from '../db/chat';
import { createMealPlan, listMealPlans, MealPlanValidationError } from '../db/meal-plan';
import { listRecipes } from '../db/recipe';
import { chatResumeBodySchema, chatSendBodySchema } from '../schemas/chat';
import type { Env } from '../env';
import type { ChatCompletionResult, LlmMessage } from '../lib/llm-chat';
import {
  resumeAgentTurn,
  runAgentTurn,
  type AgentTurnResult,
  type CompleteChatFn,
} from './agent-loop';

const U = 'u-regress';

type Step = (messages: LlmMessage[]) => ChatCompletionResult;

function text(content: string): ChatCompletionResult {
  return { content, toolCalls: [], rawAssistantMessage: { role: 'assistant', content } };
}

function calls(...list: Array<[string, string, Record<string, unknown>]>): ChatCompletionResult {
  return {
    content: '',
    toolCalls: list.map(([id, name, args]) => ({ id, name, arguments: args })),
    rawAssistantMessage: {
      role: 'assistant',
      content: null,
      tool_calls: list.map(([id, name, args]) => ({
        id,
        type: 'function' as const,
        function: { name, arguments: JSON.stringify(args) },
      })),
    },
  };
}

/** Scripted LLM: each completion consumes the next step; every call is recorded. */
function scriptedLlm(steps: Step[]) {
  const seen: LlmMessage[][] = [];
  const complete: CompleteChatFn = async ({ messages }) => {
    seen.push(messages.map((m) => ({ ...m })));
    const step = steps.shift();
    if (!step) return text('(script exhausted)');
    return step(messages);
  };
  return { complete, seen, remaining: () => steps.length };
}

async function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${U}', 'A', 'B', 'A B', 'r@x.com', 'gr')`,
  );
  const session = await createSession(h.db, U);
  const env = { DB: h.db, CHAT_RECURSION_LIMIT: '8' } as unknown as Env;
  return { ...h, env, sessionId: session.id };
}

const DAYS = ['2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27'];
const MAINS = ['Braised Pork', 'Tomato Egg Stir-fry', 'Steamed Fish', 'Chicken Curry', 'Mapo Tofu'];
const SIDES = ['Garlic Spinach', 'Stir-fried Cabbage', 'Blanched Bok Choy', 'Roasted Broccoli', 'Cucumber Salad'];

function lastToolJson(messages: LlmMessage[], name: string): Record<string, unknown> {
  const tool = [...messages].reverse().find((m) => m.role === 'tool' && m.name === name);
  return JSON.parse(String(tool?.content ?? '{}'));
}

function expectInterrupt(turn: AgentTurnResult) {
  expect(turn.kind).toBe('interrupt');
  if (turn.kind !== 'interrupt') throw new Error('not an interrupt');
  return turn;
}

describe('regression: 5 dinners x (main + side) are all scheduled and reported truthfully', () => {
  it('schedules 10 dishes, rejects invalid args before approval, and never stores a nameless meal', async () => {
    const { env, db, sessionId } = await setup();
    const fullPlan = DAYS.flatMap((d, i) => [
      { meal_name: MAINS[i], meal_type: 'dinner', serving_date: d },
      { meal_name: SIDES[i], meal_type: 'dinner', serving_date: d },
    ]);
    let invalidSeen: Record<string, unknown> | null = null;
    let ledgerSeen: Record<string, unknown> | null = null;

    const llm = scriptedLlm([
      // Turn 1: proposal (text only).
      () =>
        text(
          `Option A — create 3 new recipes, then schedule:\n${DAYS.map(
            (d, i) => `${d}: ${MAINS[i]} + ${SIDES[i]}`,
          ).join('\n')}`,
        ),
      () => text('Here is the plan above. Shall I add it to your calendar?'),
      // Turn 2 ("A: ..."): create the 3 missing recipes.
      () =>
        calls(
          ['r1', 'createRecipe', { meal_name: MAINS[0], instructions: ['Braise'], ingredients: [] }],
          ['r2', 'createRecipe', { meal_name: MAINS[2], instructions: ['Steam'], ingredients: [] }],
          ['r3', 'createRecipe', { meal_name: MAINS[4], instructions: ['Simmer'], ingredients: [] }],
        ),
      // Continuation after approval: first an invalid planMeals (merged name + bad date)…
      () =>
        calls([
          'p1',
          'planMeals',
          {
            meals: [
              { meal_name: '', meal_type: 'dinner', serving_date: DAYS[0] },
              { meal_name: 'Tomato Egg Stir-fry', meal_type: 'dinner', serving_date: '11/24' },
            ],
          },
        ]),
      // …the model sees the validation error and sends the full plan.
      (messages) => {
        invalidSeen = lastToolJson(messages, 'planMeals');
        return calls(['p2', 'planMeals', { meals: fullPlan }]);
      },
      // After the planMeals approval: summarise from the ledger.
      (messages) => {
        ledgerSeen = lastToolJson(messages, 'planMeals');
        return text('Scheduled all 10 dishes (main + side for each of the 5 dinners).');
      },
    ]);
    const deps = { completeChat: llm.complete };

    const t1 = await runAgentTurn(
      env,
      {
        userId: U,
        sessionId,
        message: 'Plan 5 dinners for next week; each day a main dish plus a vegetable side.',
        chargeQuota: false,
      },
      deps,
    );
    expect(t1.kind).toBe('complete');
    // Drain whichever proposal step the mutation nudge did not use.
    if (llm.remaining() === 5) await llm.complete({ env, messages: [] });

    const t2 = expectInterrupt(
      await runAgentTurn(
        env,
        {
          userId: U,
          sessionId,
          message: 'A: create 3 new recipes then schedule the five dinners',
          chargeQuota: false,
        },
        deps,
      ),
    );
    expect(t2.data.pendingTools.map((t) => t.name)).toEqual([
      'createRecipe',
      'createRecipe',
      'createRecipe',
    ]);
    expect(t2.message).toBe('I need your approval before making these changes.');

    const t3 = await resumeAgentTurn(
      env,
      { userId: U, sessionId, decision: 'approve', interruptId: t2.data.interruptId },
      deps,
    );
    expect(t3.kind).toBe('complete');
    if (t3.kind !== 'complete') return;
    // The continuation stopped at a fresh planMeals approval (not at the invalid call).
    expect(t3.response.type).toBe('interrupt');
    expect(invalidSeen).toMatchObject({ error: 'invalid_arguments', tool: 'planMeals' });
    expect((invalidSeen as unknown as { errors: string[] }).errors).toEqual([
      'meals[0].meal_name must not be empty',
      'meals[1].serving_date must be a YYYY-MM-DD date (got "11/24")',
    ]);
    const pending = await getPendingInterrupt(db, U, sessionId);
    expect(pending?.toolCalls).toHaveLength(1);
    expect(pending?.toolCalls[0]?.id).toBe('p2');
    const approvedMeals = pending?.toolCalls[0]?.arguments.meals as unknown[];
    expect(approvedMeals).toHaveLength(10);
    const summary = String(pending?.pendingTools[0]?.argsSummary);
    expect(summary.startsWith('10 meals (2026-11-23…2026-11-27): ')).toBe(true);
    for (let i = 0; i < 5; i++) expect(summary).toContain(`${DAYS[i]} ${MAINS[i]}, ${SIDES[i]}`);
    expect(await listMealPlans(db, U)).toHaveLength(0);

    const t4 = await resumeAgentTurn(
      env,
      {
        userId: U,
        sessionId,
        decision: 'approve',
        interruptId: String((t3.response.data as { interruptId: string }).interruptId),
      },
      deps,
    );
    expect(t4.kind).toBe('complete');
    if (t4.kind !== 'complete') return;
    expect(t4.response.type).toBe('meal_plan_updated');
    expect(t4.response.data.mealsScheduled).toBe(10);

    expect(ledgerSeen).toMatchObject({ requested: 10, createdCount: 10, errors: [] });
    const byDate = (ledgerSeen as unknown as { byDate: Record<string, { dinner: string[] }> }).byDate;
    for (let i = 0; i < 5; i++) {
      expect(byDate[DAYS[i]!]).toEqual({ dinner: [MAINS[i], SIDES[i]] });
    }

    const rows = await listMealPlans(db, U);
    expect(rows).toHaveLength(10);
    expect(rows.every((r) => r.meal_name.trim().length > 0)).toBe(true);
    const recipes = await listRecipes(db, U);
    expect(recipes.map((r) => r.meal_name).sort()).toEqual(
      [MAINS[0], MAINS[2], MAINS[4]].sort(),
    );
    // The three created recipes are linked by name; the other dishes are scheduled by name.
    expect(rows.filter((r) => r.recipe_id).map((r) => r.meal_name).sort()).toEqual(
      [MAINS[0], MAINS[2], MAINS[4]].sort(),
    );
    expect(await getPendingInterrupt(db, U, sessionId)).toBeNull();
  });

  it('a nameless meal is rejected: before approval (tool) and at the db layer', async () => {
    const { env, db, sessionId } = await setup();
    let toolResult: Record<string, unknown> | null = null;
    const llm = scriptedLlm([
      () =>
        calls([
          'a1',
          'addRecipeToMenu',
          { recipe_id: '', meal_type: 'dinner', serving_date: '2026-11-23' },
        ]),
      (messages) => {
        toolResult = lastToolJson(messages, 'addRecipeToMenu');
        return text('I need the dish name before I can schedule it.');
      },
    ]);
    const turn = await runAgentTurn(
      env,
      { userId: U, sessionId, message: 'Add a dinner for Monday to my calendar', chargeQuota: false },
      { completeChat: llm.complete },
    );
    expect(turn.kind).toBe('complete');
    expect(toolResult).toMatchObject({ error: 'invalid_arguments' });
    expect(await getPendingInterrupt(db, U, sessionId)).toBeNull();
    await expect(
      createMealPlan(db, U, { meal_type: 'dinner', serving_date: '2026-11-23', meal_name: '' }),
    ).rejects.toBeInstanceOf(MealPlanValidationError);
    expect(await listMealPlans(db, U)).toHaveLength(0);
  });

  it('invalid args never become an approval even when the model keeps failing', async () => {
    const { env, db, sessionId } = await setup();
    const bad = () =>
      calls(['b', 'planMeals', { meals: [{ meal_name: 'X', meal_type: 'tea', serving_date: '2026-11-23' }] }]);
    const llm = scriptedLlm(Array.from({ length: 8 }, () => bad));
    const turn = await runAgentTurn(
      env,
      { userId: U, sessionId, message: 'Schedule X for dinner', chargeQuota: false },
      { completeChat: llm.complete },
    );
    expect(turn.kind).toBe('complete');
    expect(await getPendingInterrupt(db, U, sessionId)).toBeNull();
    expect(await listMealPlans(db, U)).toHaveLength(0);
  });
});

describe('reply language threading', () => {
  it('short reply "A" keeps the Chinese conversation language; server strings are localised', async () => {
    const { env, db, sessionId } = await setup();
    const llm = scriptedLlm([
      () => text('方案 A：五天晚餐，每天主菜加青菜。要加入行事曆嗎？'),
      () => text('方案 A：五天晚餐。'),
      () => calls(['d1', 'removePantryItems', { items: [{ name: '排骨' }] }]),
    ]);
    const deps = { completeChat: llm.complete };
    await runAgentTurn(
      env,
      { userId: U, sessionId, message: '幫我規劃五天晚餐，每天一道主菜加一道青菜', chargeQuota: false },
      deps,
    );
    const firstSystem = String(llm.seen[0]?.[0]?.content);
    expect(firstSystem.trimEnd().endsWith(
      'Reply language: Traditional Chinese. Keep tool argument names/units in the same language.',
    )).toBe(true);
    if (llm.remaining() === 2) await llm.complete({ env, messages: [] });

    const turn = expectInterrupt(
      await runAgentTurn(env, { userId: U, sessionId, message: 'A', chargeQuota: false }, deps),
    );
    const system = String(llm.seen[llm.seen.length - 1]?.[0]?.content);
    expect(system).toMatch(/Reply language: Traditional Chinese\./);
    expect(turn.message).not.toBe('I need your approval before making these changes.');
    expect(turn.message).toMatch(/確認/);
    expect(turn.data.pendingTools[0]?.argsSummary).toBe('刪除 排骨');
    expect((await getPendingInterrupt(db, U, sessionId))?.language).toBe('zh');

    // While pending, any non yes/no message gets the localised reminder.
    const busy = expectInterrupt(
      await runAgentTurn(env, { userId: U, sessionId, message: '等一下再說', chargeQuota: false }, deps),
    );
    expect(busy.message).toMatch(/請先核准或拒絕/);
  });

  it('an explicit language field (locale tag) wins over detection; absent field defaults to English', async () => {
    const { env, sessionId } = await setup();
    const llm = scriptedLlm([() => text('Sure.'), () => text('好的。')]);
    await runAgentTurn(
      env,
      { userId: U, sessionId, message: '幫我規劃晚餐', language: 'en-US', chargeQuota: false },
      { completeChat: llm.complete },
    );
    expect(String(llm.seen[0]?.[0]?.content)).toMatch(/Reply language: English\. Keep tool argument names/);

    const other = await setup();
    const llm2 = scriptedLlm([() => text('Hi!')]);
    await runAgentTurn(
      other.env,
      { userId: U, sessionId: other.sessionId, message: 'ok', chargeQuota: false },
      { completeChat: llm2.complete },
    );
    expect(String(llm2.seen[0]?.[0]?.content)).toMatch(/Reply language: English\. Keep tool argument names/);

    const third = await setup();
    const llm3 = scriptedLlm([() => text('好')]);
    await runAgentTurn(
      third.env,
      { userId: U, sessionId: third.sessionId, message: 'plan dinner', language: 'zh-CN', chargeQuota: false },
      { completeChat: llm3.complete },
    );
    expect(String(llm3.seen[0]?.[0]?.content)).toMatch(/Reply language: Traditional Chinese\./);
  });

  it('request schemas accept the optional language field and stay backward compatible', () => {
    expect(chatSendBodySchema.parse({ message: 'hi' })).toEqual({ message: 'hi' });
    expect(chatSendBodySchema.parse({ message: 'hi', language: 'zh-TW' }).language).toBe('zh-TW');
    expect(
      chatResumeBodySchema.parse({ sessionId: 's', decision: 'approve', language: 'en' }).language,
    ).toBe('en');
    expect(chatResumeBodySchema.parse({ sessionId: 's', decision: 'reject' })).toEqual({
      sessionId: 's',
      decision: 'reject',
    });
  });
});
