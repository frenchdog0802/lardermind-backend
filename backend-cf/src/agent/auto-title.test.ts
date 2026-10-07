import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_CHAT_TITLE,
  fallbackTitleFromMessage,
  maybeAutoTitleSession,
  sanitizeTitle,
} from './auto-title';
import type { Env } from '../env';

describe('sanitizeTitle', () => {
  it('trims, strips quotes, and collapses whitespace', () => {
    expect(sanitizeTitle('  "Pantry pasta ideas"  ')).toBe('Pantry pasta ideas');
    expect(sanitizeTitle("  '週五晚餐'\nignored")).toBe('週五晚餐');
  });

  it('rejects empty and default sentinel', () => {
    expect(sanitizeTitle('')).toBeNull();
    expect(sanitizeTitle('   ')).toBeNull();
    expect(sanitizeTitle(DEFAULT_CHAT_TITLE)).toBeNull();
  });

  it('truncates long titles near a word boundary', () => {
    const long = 'alpha beta gamma delta epsilon zeta eta theta iota kappa';
    const out = sanitizeTitle(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBeLessThanOrEqual(60);
    expect(out).not.toContain('\n');
  });
});

describe('fallbackTitleFromMessage', () => {
  it('returns short messages as-is when sanitizable', () => {
    expect(fallbackTitleFromMessage('  Add milk to pantry  ')).toBe(
      'Add milk to pantry',
    );
  });

  it('truncates long messages with ellipsis', () => {
    const long =
      'Please help me plan a week of dinners using chicken, broccoli, rice, and whatever else is left in the fridge before it expires';
    const out = fallbackTitleFromMessage(long);
    expect(out).not.toBeNull();
    expect(out!.endsWith('…')).toBe(true);
    expect(out!.length).toBeLessThanOrEqual(60);
  });

  it('returns null for whitespace-only input', () => {
    expect(fallbackTitleFromMessage(' \n\t ')).toBeNull();
  });
});

describe('maybeAutoTitleSession', () => {
  const env = {} as Env;

  it('skips when session title is not the default sentinel', async () => {
    const completeChatFn = vi.fn();
    const db = {
      prepare: vi.fn(() => ({
        bind: vi.fn().mockReturnValue({
          first: vi.fn().mockResolvedValue({
            id: 's1',
            user_id: 'u1',
            title: 'Custom title',
            is_default: 0,
            created_at: 1,
            updated_at: 1,
          }),
          run: vi.fn(),
        }),
      })),
    } as unknown as D1Database;

    const result = await maybeAutoTitleSession({
      env,
      db,
      userId: 'u1',
      sessionId: 's1',
      userMessage: 'Plan pasta night',
      completeChatFn,
    });

    expect(result).toBeNull();
    expect(completeChatFn).not.toHaveBeenCalled();
  });

  it('uses LLM title when present and persists via conditional update', async () => {
    const completeChatFn = vi.fn().mockResolvedValue({
      content: 'Pasta night plan',
      toolCalls: [],
      rawAssistantMessage: { role: 'assistant', content: 'Pasta night plan' },
    });

    const first = vi
      .fn()
      .mockResolvedValueOnce({
        id: 's1',
        user_id: 'u1',
        title: DEFAULT_CHAT_TITLE,
        is_default: 0,
        created_at: 1,
        updated_at: 1,
      })
      .mockResolvedValueOnce({
        id: 's1',
        user_id: 'u1',
        title: 'Pasta night plan',
        is_default: 0,
        created_at: 1,
        updated_at: 2,
      });

    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn().mockReturnValue({ first, run });
    const db = {
      prepare: vi.fn(() => ({ bind })),
    } as unknown as D1Database;

    const result = await maybeAutoTitleSession({
      env,
      db,
      userId: 'u1',
      sessionId: 's1',
      userMessage: 'Help me plan pasta night',
      completeChatFn,
    });

    expect(completeChatFn).toHaveBeenCalled();
    expect(result?.title).toBe('Pasta night plan');
  });

  it('falls back when LLM fails', async () => {
    const completeChatFn = vi.fn().mockRejectedValue(new Error('down'));

    const first = vi
      .fn()
      .mockResolvedValueOnce({
        id: 's1',
        user_id: 'u1',
        title: DEFAULT_CHAT_TITLE,
        is_default: 0,
        created_at: 1,
        updated_at: 1,
      })
      .mockResolvedValueOnce({
        id: 's1',
        user_id: 'u1',
        title: 'Add tofu to pantry',
        is_default: 0,
        created_at: 1,
        updated_at: 2,
      });

    const run = vi.fn().mockResolvedValue({ meta: { changes: 1 } });
    const bind = vi.fn().mockReturnValue({ first, run });
    const db = {
      prepare: vi.fn(() => ({ bind })),
    } as unknown as D1Database;

    const result = await maybeAutoTitleSession({
      env,
      db,
      userId: 'u1',
      sessionId: 's1',
      userMessage: 'Add tofu to pantry',
      completeChatFn,
    });

    expect(result?.title).toBe('Add tofu to pantry');
  });
});
