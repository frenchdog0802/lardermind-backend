import { beforeEach, describe, expect, it } from 'vitest';
import { Hono } from 'hono';
import { signJwt } from '../lib/jwt';
import { preferencesRoutes } from './preferences';
import { shoppingListRoutes } from './shopping-list';
import { folderRoutes } from './folder';
import { ingredientRoutes } from './ingredient';
import { recipeRoutes } from './recipe';
import { mealPlanRoutes } from './meal-plan';
import { pantryRoutes } from './pantry';
import type { Env } from '../env';
import type { PantryItemRow } from '../db/pantry';
import type { UserPreferencesRow } from '../db/preferences';
import type { ShoppingListItemRow } from '../db/shopping-list';
import type { FolderRow } from '../db/folder';
import type { IngredientRow } from '../db/ingredient';
import type { RecipeRow, RecipeIngredientRow } from '../db/recipe';
import type { MealPlanRow } from '../db/meal-plan';

const JWT_SECRET = 'x'.repeat(32);
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type Store = {
  preferences: Map<string, UserPreferencesRow>;
  shopping: Map<string, ShoppingListItemRow>;
  folders: Map<string, FolderRow>;
  ingredients: Map<string, IngredientRow>;
  recipes: Map<string, RecipeRow>;
  recipeIngredients: Map<string, RecipeIngredientRow>;
  mealPlans: Map<string, MealPlanRow>;
  pantry: Map<string, PantryItemRow>;
};

function createMockDb() {
  const store: Store = {
    preferences: new Map(),
    shopping: new Map(),
    folders: new Map(),
    ingredients: new Map(),
    recipes: new Map(),
    recipeIngredients: new Map(),
    mealPlans: new Map(),
    pantry: new Map(),
  };

  const db = {
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          if (sql.includes('FROM user_preferences')) {
            const userId = bound[0] as string;
            return (
              [...store.preferences.values()].find(
                (r) => r.user_id === userId,
              ) ?? null
            ) as T;
          }
          if (sql.includes('FROM shopping_list_items') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.shopping.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          if (sql.includes('FROM folders') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.folders.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          if (sql.includes('FROM ingredients') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.ingredients.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          if (sql.includes('FROM recipes') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.recipes.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          if (sql.includes('FROM meal_plans') && sql.includes('id = ?')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.mealPlans.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          if (sql.includes('FROM pantry_items')) {
            if (sql.includes('LOWER(name)')) {
              const userId = bound[0] as string;
              const name = String(bound[1]).toLowerCase();
              return (
                [...store.pantry.values()].find(
                  (r) =>
                    r.user_id === userId && r.name.toLowerCase() === name,
                ) ?? null
              ) as T;
            }
            if (sql.includes('ingredient_id = ?')) {
              const userId = bound[0] as string;
              const ingredientId = bound[1] as string;
              return (
                [...store.pantry.values()].find(
                  (r) =>
                    r.user_id === userId && r.ingredient_id === ingredientId,
                ) ?? null
              ) as T;
            }
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.pantry.get(id);
            if (!row || row.user_id !== userId) return null;
            return row as T;
          }
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM shopping_list_items')) {
            const userId = bound[0] as string;
            let rows = [...store.shopping.values()].filter(
              (r) => r.user_id === userId,
            );
            if (sql.includes('LIKE LOWER(?)')) {
              const q = String(bound[1]).replace(/%/g, '').toLowerCase();
              rows = rows.filter((r) => r.name.toLowerCase().includes(q));
            }
            return {
              results: rows.sort(
                (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
              ) as T[],
            };
          }
          if (sql.includes('FROM folders')) {
            const userId = bound[0] as string;
            let rows = [...store.folders.values()].filter(
              (r) => r.user_id === userId,
            );
            if (sql.includes('LIKE LOWER(?)')) {
              const q = String(bound[1]).replace(/%/g, '').toLowerCase();
              rows = rows.filter((r) => r.name.toLowerCase().includes(q));
            }
            return {
              results: rows.sort(
                (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
              ) as T[],
            };
          }
          if (sql.includes('FROM ingredients')) {
            const userId = bound[0] as string;
            let rows = [...store.ingredients.values()].filter(
              (r) => r.user_id === userId,
            );
            if (sql.includes('LIKE LOWER(?)')) {
              const q = String(bound[1]).replace(/%/g, '').toLowerCase();
              rows = rows.filter((r) => r.name.toLowerCase().includes(q));
            }
            return {
              results: rows.sort(
                (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
              ) as T[],
            };
          }
          if (sql.includes('FROM recipes')) {
            const userId = bound[0] as string;
            let rows = [...store.recipes.values()].filter(
              (r) => r.user_id === userId,
            );
            if (sql.includes('LIKE LOWER(?)')) {
              const q = String(bound[1]).replace(/%/g, '').toLowerCase();
              rows = rows.filter((r) =>
                r.meal_name.toLowerCase().includes(q),
              );
            }
            return {
              results: rows.sort(
                (a, b) => (a.created_at ?? 0) - (b.created_at ?? 0),
              ) as T[],
            };
          }
          if (sql.includes('FROM recipe_ingredients')) {
            const recipeId = bound[0] as string;
            return {
              results: [...store.recipeIngredients.values()]
                .filter((r) => r.recipe_id === recipeId)
                .sort((a, b) => a.sort_order - b.sort_order) as T[],
            };
          }
          if (sql.includes('FROM meal_plans')) {
            const userId = bound[0] as string;
            let rows = [...store.mealPlans.values()].filter(
              (r) => r.user_id === userId,
            );
            if (sql.includes("status IN ('PLANNED', 'PENDING_CONFIRM')")) {
              rows = rows.filter((r) =>
                ['PLANNED', 'PENDING_CONFIRM'].includes(r.status),
              );
            }
            if (sql.includes('LIKE LOWER(?)')) {
              const q = String(bound[1]).replace(/%/g, '').toLowerCase();
              rows = rows.filter((r) => r.meal_name.toLowerCase().includes(q));
            }
            return {
              results: rows.sort(
                (a, b) =>
                  a.serving_date.localeCompare(b.serving_date) ||
                  (a.created_at ?? 0) - (b.created_at ?? 0),
              ) as T[],
            };
          }
          if (sql.includes('FROM pantry_items') && sql.includes('user_id = ?')) {
            const userId = bound[0] as string;
            return {
              results: [...store.pantry.values()]
                .filter((r) => r.user_id === userId)
                .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0)) as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes('INSERT INTO user_preferences')) {
            const [
              id,
              userId,
              householdNotes,
              measurementUnit,
              notes,
              allergies,
              dislikes,
              likes,
              dietary,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string,
              string,
              string,
              string,
              string,
              number,
              number,
            ];
            store.preferences.set(id, {
              id,
              user_id: userId,
              household_notes: householdNotes,
              measurement_unit: measurementUnit,
              notes,
              allergies_json: allergies,
              dislikes_json: dislikes,
              likes_json: likes,
              dietary_restrictions_json: dietary,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE user_preferences')) {
            const [
              householdNotes,
              measurementUnit,
              notes,
              allergies,
              dislikes,
              likes,
              dietary,
              updatedAt,
              userId,
            ] = bound as [string, string, string, string, string, string, string, number, string];
            const row = [...store.preferences.values()].find(
              (r) => r.user_id === userId,
            );
            if (!row) return { meta: { changes: 0 } };
            store.preferences.set(row.id, {
              ...row,
              household_notes: householdNotes,
              measurement_unit: measurementUnit,
              notes,
              allergies_json: allergies,
              dislikes_json: dislikes,
              likes_json: likes,
              dietary_restrictions_json: dietary,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO shopping_list_items')) {
            const [
              id,
              userId,
              name,
              quantity,
              unit,
              checked,
              ingredientId,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string,
              number,
              string | null,
              number,
              number,
            ];
            store.shopping.set(id, {
              id,
              user_id: userId,
              name,
              quantity,
              unit,
              checked,
              ingredient_id: ingredientId,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO folders')) {
            const [id, userId, name, icon, createdAt, updatedAt] = bound as [
              string,
              string,
              string,
              string,
              number,
              number,
            ];
            store.folders.set(id, {
              id,
              user_id: userId,
              name,
              icon,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO ingredients')) {
            const [
              id,
              userId,
              name,
              defaultUnit,
              unitKind,
              baseUnit,
              defaultDisplayUnit,
              kindLocked,
              imageUrl,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string | null,
              string | null,
              string | null,
              number,
              string | null,
              number,
              number,
            ];
            store.ingredients.set(id, {
              id,
              user_id: userId,
              name,
              default_unit: defaultUnit,
              unit_kind: unitKind,
              base_unit: baseUnit,
              default_display_unit: defaultDisplayUnit,
              kind_locked: kindLocked,
              image_url: imageUrl,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO recipes')) {
            const [
              id,
              userId,
              folderId,
              mealName,
              instructions,
              imageUrl,
              imagePublicId,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string | null,
              string,
              string,
              string | null,
              string | null,
              number,
              number,
            ];
            store.recipes.set(id, {
              id,
              user_id: userId,
              folder_id: folderId,
              meal_name: mealName,
              instructions,
              image_url: imageUrl,
              image_public_id: imagePublicId,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO recipe_ingredients')) {
            const [id, recipeId, name, quantity, unit, ingredientId, sortOrder] =
              bound as [
                string,
                string,
                string,
                string,
                string,
                string | null,
                number,
              ];
            store.recipeIngredients.set(id, {
              id,
              recipe_id: recipeId,
              name,
              quantity,
              unit,
              ingredient_id: ingredientId,
              sort_order: sortOrder,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO meal_plans')) {
            const [
              id,
              userId,
              mealType,
              servingDate,
              recipeId,
              mealName,
              image,
              status,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string | null,
              string,
              string | null,
              string,
              number,
              number,
            ];
            store.mealPlans.set(id, {
              id,
              user_id: userId,
              meal_type: mealType,
              serving_date: servingDate,
              recipe_id: recipeId,
              meal_name: mealName,
              image,
              status,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE meal_plans')) {
            const [
              mealType,
              servingDate,
              recipeId,
              mealName,
              image,
              status,
              updatedAt,
              id,
              userId,
            ] = bound as [
              string,
              string,
              string | null,
              string,
              string | null,
              string,
              number,
              string,
              string,
            ];
            const row = store.mealPlans.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            store.mealPlans.set(id, {
              ...row,
              meal_type: mealType,
              serving_date: servingDate,
              recipe_id: recipeId,
              meal_name: mealName,
              image,
              status,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO pantry_items')) {
            const [
              id,
              userId,
              name,
              quantity,
              unit,
              notes,
              ingredientId,
              createdAt,
              updatedAt,
            ] = bound as [
              string,
              string,
              string,
              string,
              string,
              string | null,
              string | null,
              number,
              number,
            ];
            store.pantry.set(id, {
              id,
              user_id: userId,
              name,
              quantity,
              unit,
              notes,
              ingredient_id: ingredientId,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE pantry_items')) {
            const [name, quantity, unit, notes, ingredientId, updatedAt, id, userId] =
              bound as [
                string,
                string,
                string,
                string | null,
                string | null,
                number,
                string,
                string,
              ];
            const row = store.pantry.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            store.pantry.set(id, {
              ...row,
              name,
              quantity,
              unit,
              notes,
              ingredient_id: ingredientId,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, store };
}

async function authHeader(userId: string): Promise<string> {
  const token = await signJwt(userId, JWT_SECRET, 3600);
  return `Bearer ${token}`;
}

function createApp(db: D1Database) {
  const app = new Hono<{ Bindings: Env }>();
  app.route('/', preferencesRoutes);
  app.route('/', shoppingListRoutes);
  app.route('/', folderRoutes);
  app.route('/', ingredientRoutes);
  app.route('/', recipeRoutes);
  app.route('/', mealPlanRoutes);
  app.route('/', pantryRoutes);
  const env = {
    DB: db,
    JWT_SECRET,
    CORS_ALLOWED_ORIGINS: '*',
    AI_MODEL: '@cf/meta/llama-3.1-8b-instruct',
    JWT_EXPIRES_IN_SECONDS: '3600',
  } as unknown as Env;
  return { app, env };
}

describe('domain CRUD routes', () => {
  let db: D1Database;
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  beforeEach(() => {
    const mock = createMockDb();
    db = mock.db;
    ({ app, env } = createApp(db));
  });

  it('GET/PUT user-preferences creates defaults then updates', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };

    const getRes = await app.request('/api/user-preferences', { headers }, env);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as {
      data: { allergies: string[]; measurementUnit: string };
    };
    expect(getBody.data.allergies).toEqual([]);
    expect(getBody.data.measurementUnit).toBe('metric');

    const putRes = await app.request(
      '/api/user-preferences',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          allergies: ['peanut'],
          measurementUnit: 'imperial',
          householdNotes: 'No nuts',
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as {
      data: { allergies: string[]; measurementUnit: string; householdNotes: string };
    };
    expect(putBody.data.allergies).toEqual(['peanut']);
    expect(putBody.data.measurementUnit).toBe('imperial');
    expect(putBody.data.householdNotes).toBe('No nuts');
  });

  it('creates and lists shopping list items', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };

    const create = await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: 'Milk',
          quantity: 2,
          unit: 'L',
          details: { quantity: 2, unit: 'L', checked: false },
        }),
      },
      env,
    );
    expect(create.status).toBe(201);

    const list = await app.request('/api/shopping-list', { headers }, env);
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as {
      data: Array<{ name: string; quantity: number; details: { quantity: number } }>;
    };
    expect(listBody.data).toHaveLength(1);
    expect(listBody.data[0].name).toBe('Milk');
    expect(listBody.data[0].quantity).toBe(2);
    expect(listBody.data[0].details.quantity).toBe(2);
  });

  it('creates a folder', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };
    const res = await app.request(
      '/api/folder',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Weeknight', icon: '🍳' }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { name: string; icon: string } };
    expect(body.data.name).toBe('Weeknight');
    expect(body.data.icon).toBe('🍳');
  });

  it('creates an ingredient', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };
    const res = await app.request(
      '/api/ingredient',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Tomato', default_unit: 'pcs' }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as { data: { name: string; default_unit: string } };
    expect(body.data.name).toBe('Tomato');
    expect(body.data.default_unit).toBe('pcs');
  });

  it('creates a recipe with ingredients', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };
    const res = await app.request(
      '/api/recipe',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_name: 'Pasta',
          instructions: ['Boil water', 'Cook pasta'],
          ingredients: [{ name: 'Pasta', quantity: 200, unit: 'g' }],
        }),
      },
      env,
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: {
        meal_name: string;
        instructions: string[];
        ingredients: Array<{ name: string; quantity: number }>;
      };
    };
    expect(body.data.meal_name).toBe('Pasta');
    expect(body.data.instructions).toEqual(['Boil water', 'Cook pasta']);
    expect(body.data.ingredients).toHaveLength(1);
    expect(body.data.ingredients[0].name).toBe('Pasta');
    expect(body.data.ingredients[0].quantity).toBe(200);
  });

  it('meal-plan confirm deducts pantry quantity', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };

    const recipeRes = await app.request(
      '/api/recipe',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_name: 'Eggs',
          instructions: ['Fry'],
          ingredients: [{ name: 'Egg', quantity: 2, unit: 'pcs' }],
        }),
      },
      env,
    );
    const recipeBody = (await recipeRes.json()) as { data: { id: string } };

    await app.request(
      '/api/pantry-item',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Egg', quantity: 5, unit: 'pcs' }),
      },
      env,
    );

    const planRes = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'breakfast',
          serving_date: '2026-09-20',
          recipe_id: recipeBody.data.id,
          meal_name: 'Eggs',
        }),
      },
      env,
    );
    const planBody = (await planRes.json()) as { data: { id: string } };

    const confirmRes = await app.request(
      `/api/meal-plan/${planBody.data.id}/confirm`,
      { method: 'POST', headers },
      env,
    );
    expect(confirmRes.status).toBe(200);
    const confirmBody = (await confirmRes.json()) as {
      data: {
        mealPlan: { status: string };
        deducted: Array<{ name: string; new_quantity: number }>;
        alreadyConfirmed: boolean;
      };
    };
    expect(confirmBody.data.alreadyConfirmed).toBe(false);
    expect(confirmBody.data.mealPlan.status).toBe('CONFIRMED');
    expect(confirmBody.data.deducted).toHaveLength(1);
    expect(confirmBody.data.deducted[0].name).toBe('Egg');
    expect(confirmBody.data.deducted[0].new_quantity).toBe(3);

    const pantryList = await app.request('/api/pantry-item', { headers }, env);
    const pantryBody = (await pantryList.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(pantryBody.data[0].quantity).toBe(3);
  });
});
