// Routing: meal-plan turns use the planner profile (and keep it across approval + resume);
// ordinary chat stays on the chat profile. reasoning_content survives the pending round-trip.
import { describe, expect, it } from 'vitest';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { createSession, getPendingInterrupt } from '../db/chat';
import type { Env } from '../env';
import type { ChatCompletionResult } from '../lib/llm-chat';
import { resumeAgentTurn, runAgentTurn, type CompleteChatFn } from './agent-loop';

const U = 'u-profile';

async function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${U}', 'A', 'B', 'A B', 'p@x.com', 'gp')`,
  );
  const session = await createSession(h.db, U);
  return { ...h, env: { DB: h.db } as unknown as Env, sessionId: session.id };
}

const text = (content: string): ChatCompletionResult => ({
  content,
  toolCalls: [],
  rawAssistantMessage: { role: 'assistant', content },
});

describe('LLM profile routing', () => {
  it('plain chat uses the chat profile', async () => {
    const { env, sessionId } = await setup();
    const profiles: Array<string | undefined> = [];
    const complete: CompleteChatFn = async ({ profile }) => {
      profiles.push(profile);
      return text('hello');
    };
    await runAgentTurn(env, { userId: U, sessionId, message: 'hi there', chargeQuota: false }, { completeChat: complete });
    expect(profiles).toEqual(['chat']);
  });

  it('meal-plan turn uses planner, stores profile + reasoning_content, resume keeps planner', async () => {
    const { env, db, sessionId } = await setup();
    const profiles: Array<string | undefined> = [];
    const sentReasoning: Array<string | undefined> = [];
    let n = 0;
    const complete: CompleteChatFn = async ({ profile, messages }) => {
      profiles.push(profile);
      sentReasoning.push(messages.find((m) => m.reasoning_content)?.reasoning_content);
      n++;
      if (n === 1) {
        const args = { meals: [{ meal_name: 'Soup', meal_type: 'dinner', serving_date: '2026-11-23' }] };
        return {
          content: '',
          toolCalls: [{ id: 'p1', name: 'planMeals', arguments: args }],
          rawAssistantMessage: {
            role: 'assistant',
            content: null,
            reasoning_content: 'private reasoning',
            tool_calls: [
              { id: 'p1', type: 'function', function: { name: 'planMeals', arguments: JSON.stringify(args) } },
            ],
          },
        };
      }
      return text('Scheduled.');
    };
    const t1 = await runAgentTurn(
      env,
      { userId: U, sessionId, message: 'Plan my meals for the week', chargeQuota: false },
      { completeChat: complete },
    );
    expect(t1.kind).toBe('interrupt');
    const pending = await getPendingInterrupt(db, U, sessionId);
    expect(pending?.profile).toBe('planner');
    expect(pending?.messages.some((m) => m.reasoning_content === 'private reasoning')).toBe(true);

    const t2 = await resumeAgentTurn(
      env,
      { userId: U, sessionId, decision: 'approve', interruptId: pending?.interruptId },
      { completeChat: complete },
    );
    expect(t2.kind).toBe('complete');
    expect(profiles).toEqual(['planner', 'planner']);
    // reasoning_content from the tool-call turn is passed back on the continuation request.
    expect(sentReasoning[1]).toBe('private reasoning');
    // …and never leaks into what the user sees.
    expect(JSON.stringify(t1) + JSON.stringify(t2)).not.toContain('private reasoning');
  });
});
