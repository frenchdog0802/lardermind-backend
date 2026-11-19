import { describe, expect, it } from 'vitest';
import { createSqliteD1 } from '../../test-utils/sqlite-d1';
import { createRecipe } from '../../db/recipe';
import { createMealPlan, listMealPlans } from '../../db/meal-plan';
import { executeTool } from './execute';

const U = 'u-ledger';

function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${U}', 'A', 'B', 'A B', 'l@x.com', 'gl')`,
  );
  return h;
}

describe('planMeals ledger (real SQL)', () => {
  it('reports byDate with several dishes per slot and names already in the slot', async () => {
    const { db } = setup();
    const main = await createRecipe(db, U, {
      meal_name: 'Braised Pork',
      instructions: [],
      ingredients: [],
    });
    await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-20',
      meal_name: 'Leftover Soup',
    });
    // Different slot (lunch) and a skipped dinner are not "in the slot".
    await createMealPlan(db, U, {
      meal_type: 'lunch',
      serving_date: '2026-11-20',
      meal_name: 'Sandwich',
    });
    await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-21',
      meal_name: 'Skipped Stew',
      status: 'SKIPPED',
    });

    const result = await executeTool(db, U, 'planMeals', {
      meals: [
        { meal_name: 'Braised Pork', meal_type: 'dinner', serving_date: '2026-11-20' },
        { meal_name: 'Garlic Spinach', meal_type: 'dinner', serving_date: '2026-11-20' },
        { meal_name: 'Tomato Egg', meal_type: 'dinner', serving_date: '2026-11-21' },
        { meal_name: 'Stir-fried Cabbage', meal_type: 'dinner', serving_date: '2026-11-21' },
      ],
    });
    const body = JSON.parse(result.content);
    expect(body.requested).toBe(4);
    expect(body.createdCount).toBe(4);
    expect(body.created).toHaveLength(4);
    expect(body.errors).toEqual([]);
    expect(body.byDate).toEqual({
      '2026-11-20': { dinner: ['Braised Pork', 'Garlic Spinach'] },
      '2026-11-21': { dinner: ['Tomato Egg', 'Stir-fried Cabbage'] },
    });
    expect(body.existingInSlot).toEqual({
      '2026-11-20': { dinner: ['Leftover Soup'] },
    });
    // Linked by name to the saved recipe.
    expect(body.created[0].recipe_id).toBe(main.id);
    // Existing card fields are kept; new ones are additive.
    expect(result.cardType).toBe('meal_plan_updated');
    expect(result.cardData?.mealsScheduled).toBe(4);
    expect(result.cardData?.mealsRequested).toBe(4);
    expect(Array.isArray(result.cardData?.meals)).toBe(true);
    expect(result.cardData?.recipeName).toBe('Braised Pork');
    expect(await listMealPlans(db, U)).toHaveLength(7);
  });

  it('flags partial saves so the model cannot claim everything was scheduled', async () => {
    const { db } = setup();
    const result = await executeTool(db, U, 'planMeals', {
      meals: [
        { meal_name: 'Rice', meal_type: 'dinner', serving_date: '2026-11-20' },
        { meal_name: '', meal_type: 'dinner', serving_date: '2026-11-21' },
      ],
    });
    const body = JSON.parse(result.content);
    expect(body.requested).toBe(2);
    expect(body.createdCount).toBe(1);
    expect(body.errors).toHaveLength(1);
    expect(body.notSaved).toBe(1);
    expect(body.warning).toMatch(/Not every requested meal was saved/);
    expect(body.byDate).toEqual({ '2026-11-20': { dinner: ['Rice'] } });
  });
});
