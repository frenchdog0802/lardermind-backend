import { afterEach, describe, expect, it, vi } from 'vitest';
import { completeChat, type LlmMessage } from './llm-chat';
import type { Env } from '../env';

const env = {
  CF_ACCOUNT_ID: 'acc',
  CF_AIG_TOKEN: 'tok',
  DEEPSEEK_API_KEY: 'sk',
  LLM_MODEL: 'deepseek-flash',
  LLM_PLANNER_MODEL: 'deepseek-v4-pro',
} as Env;

function ok(message: Record<string, unknown>) {
  return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
}

afterEach(() => vi.unstubAllGlobals());

function stubFetch(...responses: Response[]) {
  const fn = vi.fn();
  for (const r of responses) fn.mockResolvedValueOnce(r);
  vi.stubGlobal('fetch', fn);
  return fn;
}
const bodyOf = (fn: ReturnType<typeof vi.fn>, i: number) =>
  JSON.parse(fn.mock.calls[i][1].body as string);

describe('completeChat profiles', () => {
  it('chat: deepseek-flash with thinking disabled and no reasoning_effort', async () => {
    const fn = stubFetch(ok({ content: 'hi' }));
    const r = await completeChat({ env, messages: [{ role: 'user', content: 'x' }] });
    const body = bodyOf(fn, 0);
    expect(body.model).toBe('deepseek-flash');
    expect(body.thinking).toEqual({ type: 'disabled' });
    expect(body.reasoning_effort).toBeUndefined();
    expect(r.content).toBe('hi');
  });

  it('planner: deepseek-v4-pro with thinking enabled; reasoning_content kept off content', async () => {
    const fn = stubFetch(
      ok({
        content: '',
        reasoning_content: 'secret thoughts',
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'planMeals', arguments: '{"meals":[]}' } },
        ],
      }),
    );
    const r = await completeChat({
      env,
      profile: 'planner',
      messages: [{ role: 'user', content: 'plan my week' }],
    });
    const body = bodyOf(fn, 0);
    expect(body.model).toBe('deepseek-v4-pro');
    expect(body.thinking).toEqual({ type: 'enabled' });
    expect(body.reasoning_effort).toBe('high');
    expect(r.content).toBe('');
    expect(r.toolCalls[0]!.name).toBe('planMeals');
    // Kept for the next API request (tool calls), but not part of user-visible content.
    expect(r.rawAssistantMessage.reasoning_content).toBe('secret thoughts');
    expect(r.rawAssistantMessage.content).toBeNull();
  });

  it('planner passes reasoning_content back in follow-up requests', async () => {
    const fn = stubFetch(ok({ content: 'done' }));
    const messages: LlmMessage[] = [
      { role: 'user', content: 'plan' },
      { role: 'assistant', content: null, reasoning_content: 'why', tool_calls: [] },
    ];
    await completeChat({ env, profile: 'planner', messages });
    expect(bodyOf(fn, 0).messages[1].reasoning_content).toBe('why');
  });

  it('planner failure falls back to chat model without reasoning_content', async () => {
    const fn = stubFetch(new Response('bad', { status: 400 }), ok({ content: 'fallback' }));
    const r = await completeChat({
      env,
      profile: 'planner',
      messages: [{ role: 'assistant', content: 'a', reasoning_content: 'why' }],
    });
    expect(r.content).toBe('fallback');
    expect(bodyOf(fn, 1).model).toBe('deepseek-flash');
    expect(bodyOf(fn, 1).thinking).toEqual({ type: 'disabled' });
    expect(bodyOf(fn, 1).messages[0].reasoning_content).toBeUndefined();
  });

  it('planner network error falls back; chat failure throws', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('net'))
      .mockResolvedValueOnce(ok({ content: 'ok' }));
    vi.stubGlobal('fetch', fn);
    expect((await completeChat({ env, profile: 'planner', messages: [] })).content).toBe('ok');
    stubFetch(new Response('x', { status: 500 }));
    await expect(completeChat({ env, messages: [] })).rejects.toThrow(/500/);
  });
});
