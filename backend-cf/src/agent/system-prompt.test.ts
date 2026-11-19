import { describe, expect, it } from 'vitest';
import {
  buildCookingAssistantSystemPrompt,
  COOKING_ASSISTANT_SYSTEM_PROMPT,
  resolveTodayLocalDate,
} from './system-prompt';
import { COOKING_TOOLS } from './tools/definitions';

function toolDescription(name: string): string {
  const tool = COOKING_TOOLS.find((t) => t.function.name === name);
  return String(tool?.function.description ?? '');
}

const prompt = () => buildCookingAssistantSystemPrompt({ todayLocalDate: '2026-10-11' });

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
    const p = prompt();
    expect(p).toContain("Today's local calendar date is 2026-10-11");
    expect(p).toMatch(/今天|today/i);
    expect(p).toMatch(/Do not invent a different calendar date/i);
  });

  it('forbids inventing prior tool failure against visible successes', () => {
    const p = prompt();
    expect(p).toMatch(/prior turn failed to call tools/i);
    expect(p).toMatch(/successful tool or card result/i);
  });

  it('is ordered by priority: language, truthfulness, planning, approval, empty kitchen, calendar tail', () => {
    const p = prompt();
    const order = [
      '1. Language',
      '2. Truthfulness',
      '3. Planning contract',
      '4. Approval behaviour',
      '5. Empty or sparse kitchen',
      '6. Calendar context',
      'Reply language:',
    ].map((heading) => p.indexOf(heading));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('truthfulness: writes only via tools; claims only what the latest result created (R2)', () => {
    const p = prompt();
    expect(p).toMatch(/ONLY through tools/);
    expect(p).toMatch(/you MUST call the tool/i);
    expect(p).toMatch(/Only state as done what appears in the latest tool result's `created` \/ `byDate`/);
    expect(p).toMatch(/If `errors` is non-empty.*createdCount < requested, say exactly what was not saved/);
    // The old wording that biased toward claiming success is gone.
    expect(p).not.toMatch(/do not invent failure/i);
    expect(p).toMatch(/only such a result counts as proof/);
  });

  it('planning contract: R1 several dishes per slot, each its own planMeals entry', () => {
    const p = prompt();
    expect(p).toMatch(/A meal slot may hold several dishes/);
    expect(p).toMatch(/Every dish you proposed \(main, side, soup\) is its own planMeals entry with the same serving_date and meal_type/);
    expect(p).toMatch(/Never merge dishes into one name/);
    // Contradiction (ii) removed: no more discouraging a second dish in a slot.
    expect(p).not.toMatch(/Prefer asking whether to keep both or pick one/);
    expect(p).not.toMatch(/warn\*\* that the slot already has a meal/);
    // Duplicates are reported from the ledger instead.
    expect(p).toMatch(/existingInSlot/);
    expect(p).toMatch(/same serving_date \+ meal_type/);
  });

  it('planning contract: R3 re-read the proposal, R4 never drop dishes, R5 options restate the full list', () => {
    const p = prompt();
    expect(p).toMatch(/re-read your last proposed plan; the `meals` array must contain every proposed dish for every day/);
    expect(p).toMatch(/If you deviate, list the differences and ask first/);
    expect(p).toMatch(/Never silently drop or substitute dishes/);
    expect(p).toMatch(/"Create N new recipes" does not limit the plan to N dishes/);
    expect(p).toMatch(/each option restates the full day-by-day dish list it will schedule/);
  });

  it('contradiction (i) resolved: propose with full list, confirm, then createRecipe + planMeals in one go', () => {
    const p = prompt();
    expect(p).toMatch(/give the full day-by-day dish list.*then ask whether to add it to the Calendar/);
    expect(p).toMatch(/After the user confirms, continue in one go: createRecipe for each missing recipe, then call planMeals for ALL proposed dishes/);
    expect(p).not.toMatch(/Orchestration/);
  });

  it('contradiction (iii) resolved: plan shortages vs ad-hoc shopping tool', () => {
    const p = prompt();
    expect(p).toMatch(/For plan shortages use addMealPlanShortagesToShoppingList/);
    expect(p).toMatch(/use addItemsToShoppingList only for ad-hoc items the user names/);
    expect(p).not.toMatch(/Offer shopping → addItemsToShoppingList/);
  });

  it('documents soft-reserve, pantry CRUD, and the planning tools', () => {
    const p = prompt();
    expect(p).toMatch(/updatePantryItems|removePantryItems/);
    expect(p).toMatch(/soft-reserves|soft reserve/i);
    expect(p).toMatch(/planMeals/);
    expect(p).toMatch(/getMealPlanAvailability/);
    expect(p).toMatch(/addItemsToShoppingList/);
  });

  it('per-meal shortage reporting lives in the prompt + getMealPlanAvailability description', () => {
    const p = prompt();
    expect(p).toMatch(/per meal first/i);
    const d = toolDescription('getMealPlanAvailability');
    expect(d).toMatch(/Never put meal A's shortages under meal B/i);
    expect(d).toMatch(/do not invent doubt/i);
    expect(d).toMatch(/after the per-meal breakdown|combined cart/i);
    expect(d).toMatch(/unit_mismatch/);
  });

  it('planMeals / addRecipeToMenu descriptions carry the slot and naming rules', () => {
    const plan = toolDescription('planMeals');
    expect(plan).toMatch(/one entry per dish \(main, side, soup\) with the same serving_date and meal_type/);
    expect(plan).toMatch(/byDate/);
    expect(plan).toMatch(/existingInSlot/);
    expect(toolDescription('addRecipeToMenu')).toMatch(/at least one/);
  });

  it('requires getPreferences before plan and covers cap / units / non-food', () => {
    const p = prompt();
    expect(p).toMatch(/getPreferences/);
    expect(p).toMatch(/Honor allergies/i);
    expect(p).toMatch(/at most 28/i);
    expect(p).toMatch(/Refuse non-food/i);
    expect(p).toMatch(/unit_mismatch|Do not invent unit conversions/i);
    expect(p).toMatch(/shopping list lines were removed/i);
  });

  it('documents conditionally_cookable and assumeBasicSeasonings', () => {
    const p = prompt();
    expect(p).toMatch(/assumeBasicSeasonings/);
    expect(p).toMatch(/conditionally_cookable/);
    expect(p).toMatch(/Never call these fully cookable|完全可煮/);
    expect(p).toMatch(/missingMains|缺山藥/);
  });

  it('documents first-win paste list orchestration', () => {
    const p = prompt();
    expect(p).toMatch(/First-win paste list/i);
    expect(p).toMatch(/addPantryItems/);
    expect(p).toMatch(/createRecipe/);
    expect(p).toMatch(/suggestMealsFromPantry/);
    expect(p).toMatch(/paste a short fridge/i);
  });

  it('requires updateRecipe for edits and preserves recipe units', () => {
    const p = prompt();
    expect(p).toMatch(/updateRecipe/);
    expect(p).toMatch(/cups\s*↔\s*ml|never convert cups/i);
    expect(p).toMatch(/unit strings exactly/i);
  });

  it('documents value-first empty reply policy vs stock-dependent paste', () => {
    const p = prompt();
    expect(p).toMatch(/Empty or sparse kitchen — reply policy/i);
    expect(p).toMatch(/Knowledge \/ principle \/ generic plan/i);
    expect(p).toMatch(/answer first/i);
    expect(p).toMatch(/Do \*\*not\*\* open with|must \*\*not\*\* cause refuse-first/i);
    expect(p).toMatch(/規劃第一天副食品/);
    expect(p).toMatch(/Stock-dependent/i);
    expect(p).toMatch(/Ambiguous/i);
    expect(p).toMatch(/short generic starter/i);
    expect(p).toMatch(/value before homework/i);
    expect(p).toMatch(/Never invent stock without approval|Never invent pantry/i);
  });

  it('documents define_unit card and re-suggest after conversion', () => {
    const p = prompt();
    expect(p).toMatch(/define_unit/);
    expect(p).toMatch(/suggestMealsFromPantry.*again|call \*\*suggestMealsFromPantry\*\* again/i);
  });

  it('plans from ingredients in the user message without inventing quantities or conflicting pantries', () => {
    const p = prompt();
    expect(p).toMatch(/ephemeral pantry/i);
    expect(p).toMatch(/Answer with the plan/i);
    expect(p).toMatch(/Never invent quantities/i);
    expect(p).toMatch(/two conflicting pantries/i);
    expect(p).toMatch(/merge/i);
  });

  it('round 4: spoons of dry goods are converted by the app; plain "nothing short" wording', () => {
    const p = prompt();
    expect(p).toMatch(/never report such an item as short/i);
    expect(p).toMatch(/you have all the ingredients you need/i);
    expect(p).toMatch(/never write phrases like "0 recipes missing/i);
  });

  it('is clearly shorter than the previous ~13 KB prompt', () => {
    expect(new TextEncoder().encode(prompt()).length).toBeLessThan(12_000);
  });
});

describe('reply language', () => {
  it('ends with a Reply language line, English by default', () => {
    const p = prompt();
    expect(p.trimEnd().split('\n').pop()).toBe(
      'Reply language: English. Keep tool argument names/units in the same language.',
    );
  });

  it('names Traditional Chinese for zh', () => {
    const p = buildCookingAssistantSystemPrompt({ todayLocalDate: '2026-10-11', language: 'zh' });
    expect(p.trimEnd().split('\n').pop()).toBe(
      'Reply language: Traditional Chinese. Keep tool argument names/units in the same language.',
    );
  });

  it('keeps the static prefix identical across languages and dates (prompt caching)', () => {
    const en = buildCookingAssistantSystemPrompt({ todayLocalDate: '2026-10-11', language: 'en' });
    const zh = buildCookingAssistantSystemPrompt({ todayLocalDate: '2026-12-01', language: 'zh' });
    expect(en.startsWith(COOKING_ASSISTANT_SYSTEM_PROMPT)).toBe(true);
    expect(zh.startsWith(COOKING_ASSISTANT_SYSTEM_PROMPT)).toBe(true);
    expect(COOKING_ASSISTANT_SYSTEM_PROMPT).not.toMatch(/Reply language: (English|Traditional Chinese)/);
    expect(COOKING_ASSISTANT_SYSTEM_PROMPT).not.toMatch(/\d{4}-\d{2}-\d{2}/);
  });

  it('tells the model short replies never switch the language and tool names/units follow it', () => {
    const p = prompt();
    expect(p).toMatch(/Reply in the language named on the final "Reply language" line/);
    expect(p).toMatch(/Short replies such as "A", "ok" or 「好」 never change it/);
    expect(p).toMatch(/Tool argument name and unit strings MUST use that same language/i);
    expect(p).toMatch(/Do not switch into Chinese examples/i);
  });
});
