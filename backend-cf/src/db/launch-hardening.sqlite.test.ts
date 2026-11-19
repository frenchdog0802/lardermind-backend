import { describe, expect, it } from 'vitest';
import { createSqliteD1 } from '../test-utils/sqlite-d1';
import { createRecipe, updateRecipe, listRecipes, listIngredientRowsForRecipes } from './recipe';
import { ensureDefaultFolders } from './folder';
import {
  confirmMealPlan,
  computeWeekAvailability,
  createMealPlan,
  listMealPlans,
} from './meal-plan';
import {
  createShoppingListItem,
  findUncheckedByNameUnitCi,
  mergeAddShoppingListItem,
  syncItemsToPantry,
  unsyncItemsFromPantry,
} from './shopping-list';
import { createPantryItem, findByNameCi, listPantryItems } from './pantry';
import { findUserByEmail, findUserById, softDeleteUser } from './users';

const U = 'u1';

function setup() {
  const h = createSqliteD1();
  h.sqlite.exec(
    `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('${U}', 'A', 'B', 'A B', 'a@x.com', 'g1')`,
  );
  return h;
}

describe('real SQL: recipes', () => {
  it('createRecipe / updateRecipe persist atomically and list groups ingredients', async () => {
    const { db, batches, log } = setup();
    const a = await createRecipe(db, U, {
      meal_name: 'Soup',
      instructions: ['Boil'],
      ingredients: [
        { name: 'Water', quantity: 1, unit: 'l' },
        { name: 'Salt', quantity: 2, unit: 'g' },
      ],
    });
    const b = await createRecipe(db, U, {
      meal_name: 'Salad',
      instructions: [],
      ingredients: [{ name: 'Leaf', quantity: 3, unit: 'pcs' }],
    });
    expect(batches).toHaveLength(2);
    const upd = await updateRecipe(db, U, a.id, {
      ingredients: [{ name: 'Stock', quantity: 1, unit: 'l' }],
    });
    expect(upd!.ingredients.map((i) => i.name)).toEqual(['Stock']);
    expect(upd!.meal_name).toBe('Soup');

    log.length = 0;
    const rows = await listRecipes(db, U);
    const grouped = await listIngredientRowsForRecipes(db, rows.map((r) => r.id));
    expect(log.length).toBe(2); // recipes + ONE grouped ingredients query
    expect(grouped.get(a.id)!.map((r) => r.name)).toEqual(['Stock']);
    expect(grouped.get(b.id)!.map((r) => r.name)).toEqual(['Leaf']);
    const paged = await listRecipes(db, U, undefined, { limit: 1, offset: 1 });
    expect(paged).toHaveLength(1);
  });

  it('a failing ingredient insert rolls the whole create back', async () => {
    const { db, sqlite } = setup();
    await expect(
      createRecipe(db, U, {
        meal_name: 'Broken',
        instructions: [],
        // quantity NaN stringifies fine; force a NOT NULL violation via a null name.
        ingredients: [{ name: null as unknown as string, quantity: 1, unit: 'g' }],
      }),
    ).rejects.toThrow();
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM recipes').get()).toEqual({ n: 0 });
  });

  it('chunks IN lists above 90 ids', async () => {
    const { db } = setup();
    const ids: string[] = [];
    for (let i = 0; i < 120; i++) {
      const r = await createRecipe(db, U, {
        meal_name: `R${i}`,
        instructions: [],
        ingredients: [{ name: `I${i}`, quantity: 1, unit: 'g' }],
      });
      ids.push(r.id);
    }
    const grouped = await listIngredientRowsForRecipes(db, ids);
    expect(grouped.size).toBe(120);
  });
});

describe('real SQL: folders', () => {
  it('seeds defaults once, then only missing ones', async () => {
    const { db, sqlite } = setup();
    expect((await ensureDefaultFolders(db, U)).map((f) => f.name)).toHaveLength(5);
    expect((await ensureDefaultFolders(db, U)).length).toBe(5);
    sqlite.exec(`DELETE FROM folders WHERE name = 'Lunch'`);
    const merged = await ensureDefaultFolders(db, U);
    expect(merged.map((f) => f.name).sort()).toEqual(
      ['Breakfast', 'Dinner', 'Favorites', 'Lunch', 'Uncategorized'].sort(),
    );
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM folders').get()).toEqual({ n: 5 });
  });
});

describe('real SQL: meal plan', () => {
  it('range filter, availability and confirm (one batch) behave end to end', async () => {
    const { db, batches, sqlite } = setup();
    const recipe = await createRecipe(db, U, {
      meal_name: 'Omelette',
      instructions: [],
      ingredients: [
        { name: 'Egg', quantity: 2, unit: 'pcs' },
        { name: 'Butter', quantity: 20, unit: 'g' },
      ],
    });
    await createPantryItem(db, U, { name: 'eggs', quantity: 6, unit: 'pcs' });
    await createPantryItem(db, U, { name: 'Butter', quantity: 20, unit: 'g' });
    const p1 = await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-09-20',
      recipe_id: recipe.id,
      meal_name: 'Omelette',
    });
    await createMealPlan(db, U, {
      meal_type: 'dinner',
      serving_date: '2026-10-20',
      meal_name: 'omelette',
    });
    expect(await listMealPlans(db, U, undefined, { from: '2026-09-01', to: '2026-09-30' })).toHaveLength(1);
    expect(await listMealPlans(db, U)).toHaveLength(2);

    const week = await computeWeekAvailability(db, U, '2026-09-01', '2026-10-31');
    expect(week.meals.map((m) => m.status)).toEqual(['ok', 'short']);
    // First meal takes 2 eggs + 20 g butter, so the second (by-name link) lacks butter.
    expect(week.weekShortages.map((s) => s.name)).toEqual(['Butter']);

    batches.length = 0;
    const res = await confirmMealPlan(db, U, p1.id);
    expect(res!.mealPlan.status).toBe('CONFIRMED');
    expect(res!.deducted.map((d) => d.name).sort()).toEqual(['Butter', 'Egg']);
    expect(batches).toHaveLength(1);
    const pantry = await listPantryItems(db, U);
    expect(pantry.map((p) => [p.name, p.quantity])).toEqual([['eggs', '4']]); // butter row gone
    expect(sqlite.prepare(`SELECT status FROM meal_plans WHERE id = ?`).get(p1.id)).toEqual({
      status: 'CONFIRMED',
    });
  });
});

describe('real SQL: shopping sync / unsync / merge', () => {
  it('sync -> unsync round trip with one batch each, merge target found via NOCASE', async () => {
    const { db, batches } = setup();
    await createPantryItem(db, U, { name: 'Milk', quantity: 500, unit: 'ml' });
    const milk = await createShoppingListItem(db, U, { name: 'milk', quantity: 1, unit: 'l', checked: true });
    const eggs = await createShoppingListItem(db, U, { name: 'Eggs', quantity: 6, unit: 'pcs', checked: true });
    const open = await createShoppingListItem(db, U, { name: 'Tea', quantity: 1, unit: 'box' });

    const synced = await syncItemsToPantry(db, U, [{ id: milk.id }, { id: eggs.id }, { id: open.id }, { id: 'nope' }]);
    expect(synced.synced.map((s) => s.name)).toEqual(['milk', 'Eggs']);
    expect(synced.skipped).toEqual([
      { id: open.id, reason: 'not_checked' },
      { id: 'nope', reason: 'not_found' },
    ]);
    expect(synced.synced[0]!.version).toBe(2);
    expect(batches).toHaveLength(1);
    let pantry = await listPantryItems(db, U);
    expect(Number(pantry.find((p) => p.name === 'Milk')!.quantity)).toBeCloseTo(1500);
    expect(pantry.find((p) => p.name === 'Eggs')!.quantity).toBe('6');
    expect((await syncItemsToPantry(db, U, [{ id: milk.id }])).skipped[0]!.reason).toBe('already_synced');

    const undone = await unsyncItemsFromPantry(db, U, [milk.id, eggs.id]);
    expect(undone.unsynced).toHaveLength(2);
    pantry = await listPantryItems(db, U);
    expect(pantry.map((p) => p.name)).toEqual(['Milk']);
    expect(Number(pantry[0]!.quantity)).toBeCloseTo(500);

    // merge-add: unchecked CI match merges, checked-only does not.
    const m = await mergeAddShoppingListItem(db, U, { name: 'TEA', quantity: 2, unit: 'box' });
    expect(m.merged).toBe(true);
    expect(Number(m.item.quantity)).toBe(3);
    expect(await findUncheckedByNameUnitCi(db, U, 'eggs', 'pcs')).toBeNull(); // checked row
    expect((await findByNameCi(db, U, 'MILK'))!.name).toBe('Milk');
  });
});

describe('real SQL: soft delete', () => {
  it('frees the email + google id, hides the user, keeps the row', async () => {
    const { db, sqlite } = setup();
    sqlite.exec(
      `INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ('t1', '${U}', 'h', 9999999999, 1)`,
    );
    expect(await softDeleteUser(db, U)).toBe(true);
    expect(await findUserById(db, U)).toBeNull();
    expect(await findUserByEmail(db, 'a@x.com')).toBeNull();
    const row = sqlite.prepare('SELECT * FROM users WHERE id = ?').get(U) as Record<string, unknown>;
    expect(row.deleted_email).toBe('a@x.com');
    expect(row.deleted_google_id).toBe('g1');
    expect(row.google_id).toBeNull();
    expect(sqlite.prepare('SELECT used_at FROM password_reset_tokens').get()).not.toEqual({ used_at: null });
    // The email is free again: a new account can use it (UNIQUE not violated).
    sqlite.exec(
      `INSERT INTO users (id, first_name, last_name, name, email, google_id) VALUES ('u2', 'A', 'B', 'A B', 'a@x.com', 'g1')`,
    );
    expect(await softDeleteUser(db, U)).toBe(false);
  });
});
