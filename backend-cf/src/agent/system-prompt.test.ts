import { describe, expect, it } from 'vitest';
import {
  buildCookingAssistantSystemPrompt,
  resolveTodayLocalDate,
} from './system-prompt';

describe('resolveTodayLocalDate', () => {
  it('accepts a valid clientLocalDate', () => {
    expect(resolveTodayLocalDate('2026-10-11')).toBe('2026-10-11');
  });

  it('falls back to UTC calendar date when missing or invalid', () => {
    const now = new Date('2026-10-11T15:30:00.000Z');
    expect(resolveTodayLocalDate(undefined, now)).toBe('2026-10-11');
    expect(resolveTodayLocalDate('not-a-date', now)).toBe('2026-10-11');
    expect(resolveTodayLocalDate('2026/10/11', now)).toBe('2026-10-11');
  });
});

describe('buildCookingAssistantSystemPrompt', () => {
  it('injects today and forbids inventing another today date', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toContain("Today's local calendar date is 2026-10-11");
    expect(prompt).toMatch(/今天|today/i);
    expect(prompt).toMatch(/Do not invent a different calendar date/i);
  });

  it('forbids inventing prior tool failure against visible successes', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/prior turn failed to call tools/i);
    expect(prompt).toMatch(/successful tool or card result/i);
  });

  it('documents soft-reserve, pantry CRUD, and orchestration', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/updatePantryItems|removePantryItems/);
    expect(prompt).toMatch(/soft-reserves|soft reserve/i);
    expect(prompt).toMatch(/planMeals/);
    expect(prompt).toMatch(/getMealPlanAvailability/);
    expect(prompt).toMatch(/addItemsToShoppingList/);
  });
});
