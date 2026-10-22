import { describe, expect, it } from 'vitest';
import { pendingInterruptForHistory } from './chat';
import type { PendingInterrupt } from './chat';

describe('pendingInterruptForHistory', () => {
  it('returns pendingTools summary only when pending exists', () => {
    const pending: PendingInterrupt = {
      createdAt: 1,
      pendingTools: [{ name: 'planMeals', argsSummary: '酸菜雞肉' }],
      toolCalls: [
        {
          id: 'c1',
          name: 'planMeals',
          arguments: { meals: [] },
        },
      ],
      messages: [{ role: 'assistant', content: 'secret' }],
    };

    expect(pendingInterruptForHistory(pending)).toEqual({
      interruptId: 'legacy:1:c1',
      expiresAt: 1 + 20 * 60,
      pendingTools: [{ name: 'planMeals', argsSummary: '酸菜雞肉' }],
    });
  });

  it('returns null when no pending interrupt', () => {
    expect(pendingInterruptForHistory(null)).toBeNull();
  });
});
