import { describe, expect, it } from 'vitest';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { createRecipe, listRecipes } from './recipe';
import { createShoppingListItem, listShoppingListItems } from './shopping-list';
import { createIngredient, listIngredients } from './ingredient';
import { createFolder, listFolders } from './folder';
import { createMealPlan, listMealPlans } from './meal-plan';
import { executeTool } from '../agent/tools/execute';

const U = 'u1';
const LONG =
  'Slow-Braised Taiwanese Pork Belly with Soy, Star Anise and Rock Sugar Over Rice';

function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${U}', 'A', 'B', 'A B', 'a@x.com', 'g1')`,
  );
  return h;
}

describe('D1 LIKE pattern limit (regression)', () => {
  it('the test harness emulates the D1 limit', async () => {
    const { db } = setup();
    expect(() =>
      db.prepare(`SELECT 1 WHERE 'a' LIKE ?`).bind(`%${'x'.repeat(60)}%`),
    ).toThrow(/too complex/);
  });

  it('createRecipe tool saves recipes whose names exceed 50 bytes', async () => {
    const { db } = setup();
    for (let i = 0; i < 7; i++) {
      const res = await executeTool(db, U, 'createRecipe', {
        meal_name: `${LONG} #${i}`,
        instructions: ['cook'],
        ingredients: [{ name: 'rice', quantity: 1, unit: 'cup' }],
      } as never);
      expect(res.content).not.toContain('error');
    }
    expect((await listRecipes(db, U)).length).toBe(7);
  });

  it('createRecipe tool still dedupes an exact (case-insensitive) long name', async () => {
    const { db } = setup();
    await createRecipe(db, U, { meal_name: LONG, instructions: [], ingredients: [] });
    const res = await executeTool(db, U, 'createRecipe', {
      meal_name: LONG.toUpperCase(),
      instructions: [],
      ingredients: [],
    } as never);
    expect(res.content).toContain('already exists');
  });

  it('list queries accept long text and keep substring, case-insensitive matching', async () => {
    const { db } = setup();
    await createRecipe(db, U, { meal_name: 'Pork Belly', instructions: [], ingredients: [] });
    await createShoppingListItem(db, U, { name: 'Pork Belly', quantity: 1, unit: 'kg' } as never);
    await createIngredient(db, U, { name: 'Pork Belly', quantity: 1, unit: 'kg' } as never);
    await createFolder(db, U, { name: 'Pork Belly' } as never);
    await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-11-19',
      meal_name: 'Pork Belly',
    });
    const long = LONG.repeat(3);
    expect(await listRecipes(db, U, long)).toEqual([]);
    expect(await listShoppingListItems(db, U, long)).toEqual([]);
    expect(await listIngredients(db, U, long)).toEqual([]);
    expect(await listFolders(db, U, long)).toEqual([]);
    expect(await listMealPlans(db, U, long)).toEqual([]);
    expect((await listRecipes(db, U, 'pORK')).length).toBe(1);
    expect((await listShoppingListItems(db, U, 'belly')).length).toBe(1);
    expect((await listIngredients(db, U, 'belly')).length).toBe(1);
    expect((await listFolders(db, U, 'pork')).length).toBe(1);
    expect((await listMealPlans(db, U, 'belly')).length).toBe(1);
  });

  it('treats % and _ in user text literally', async () => {
    const { db } = setup();
    await createRecipe(db, U, { meal_name: 'Pork Belly', instructions: [], ingredients: [] });
    await createRecipe(db, U, { meal_name: '100% Juice', instructions: [], ingredients: [] });
    expect((await listRecipes(db, U, '%')).map((r) => r.meal_name)).toEqual(['100% Juice']);
    expect(await listRecipes(db, U, 'P_rk')).toEqual([]);
  });
});
