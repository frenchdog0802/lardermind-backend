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

  it('requires per-meal shortage reporting before week shopping union', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/per meal first/i);
    expect(prompt).toMatch(/Never put meal A's shortages under meal B/i);
    expect(prompt).toMatch(/Do not invent doubt/i);
    expect(prompt).toMatch(/after.*per-meal breakdown|combined cart/i);
  });

  it('requires getPreferences before plan and covers fuzz / unit / slot warn', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/getPreferences/);
    expect(prompt).toMatch(/Honor allergies/i);
    expect(prompt).toMatch(/at most 28/i);
    expect(prompt).toMatch(/Refuse non-food/i);
    expect(prompt).toMatch(/unit_mismatch|Do not invent unit conversions/i);
    expect(prompt).toMatch(/warn.*slot|same serving_date/i);
    expect(prompt).toMatch(/shopping list lines were removed/i);
  });

  it('documents conditionally_cookable and assumeBasicSeasonings', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/assumeBasicSeasonings/);
    expect(prompt).toMatch(/conditionally_cookable/);
    expect(prompt).toMatch(/Never call these fully cookable|完全可煮/);
    expect(prompt).toMatch(/missingMains|缺山藥/);
  });

  it('documents first-win paste list orchestration', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/First-win paste list/i);
    expect(prompt).toMatch(/addPantryItems/);
    expect(prompt).toMatch(/createRecipe/);
    expect(prompt).toMatch(/suggestMealsFromPantry/);
    expect(prompt).toMatch(/paste a short fridge/i);
  });

  it('documents value-first empty reply policy vs stock-dependent paste', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/Empty or sparse kitchen — reply policy/i);
    expect(prompt).toMatch(/Knowledge \/ principle \/ generic plan/i);
    expect(prompt).toMatch(/answer first/i);
    expect(prompt).toMatch(/Do \*\*not\*\* open with|must \*\*not\*\* cause refuse-first/i);
    expect(prompt).toMatch(/規劃第一天副食品/);
    expect(prompt).toMatch(/Stock-dependent/i);
    expect(prompt).toMatch(/Ambiguous/i);
    expect(prompt).toMatch(/short generic starter/i);
    expect(prompt).toMatch(/value before homework/i);
    expect(prompt).toMatch(/Never invent stock without approval|Never invent pantry/i);
  });

  it('documents define_unit card and re-suggest after conversion', () => {
    const prompt = buildCookingAssistantSystemPrompt({
      todayLocalDate: '2026-10-11',
    });
    expect(prompt).toMatch(/define_unit/);
    expect(prompt).toMatch(/suggestMealsFromPantry.*again|call \*\*suggestMealsFromPantry\*\* again/i);
  });
});
