import { describe, expect, it } from 'vitest';
import {
  consumeOpenAiCompatSse,
  extractDeltaContent,
} from './openai-compat';

describe('openai-compat stream parse', () => {
  it('extracts delta content strings', () => {
    expect(
      extractDeltaContent({
        choices: [{ delta: { content: 'Hi' } }],
      }),
    ).toBe('Hi');
    expect(extractDeltaContent({ choices: [{ delta: {} }] })).toBe('');
  });

  it('parses SSE frames across chunk boundaries', () => {
    const part1 = 'data: {"choices":[{"delta":{"content":"Hel';
    const mid = consumeOpenAiCompatSse(part1, '');
    expect(mid.texts).toEqual([]);
    expect(mid.carry.length).toBeGreaterThan(0);

    const part2 = 'lo"}}]}\n\ndata: [DONE]\n';
    const done = consumeOpenAiCompatSse(part2, mid.carry);
    expect(done.texts.join('')).toBe('Hello');
  });
});
