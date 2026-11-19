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

  const queries: string[] = [];
  const batches: string[][] = [];

  const db = {
    async batch(stmts: Array<{ __sql: string; __kind: () => Promise<unknown> }>) {
      batches.push(stmts.map((s) => s.__sql));
      const out: unknown[] = [];
      for (const s of stmts) out.push(await s.__kind());
      return out;
    },
    prepare(sql: string) {
      let bound: unknown[] = [];
      return {
        __sql: sql,
        __kind(): Promise<unknown> {
          return /^s*SELECT/i.test(sql) || sql.includes('RETURNING')
            ? (this as any).all()
            : (this as any).run();
        },
        bind(...args: unknown[]) {
          bound = args;
          return this;
        },
        async first<T>() {
          queries.push(sql);
          if (sql.includes('FROM users')) {
            const id = String(bound[0] ?? USER_A);
            return {
              id,
              first_name: 'A',
              last_name: 'B',
              name: 'A B',
              email: 'a@example.com',
              hashed_password: null,
              salt: null,
              role: 'user',
              google_id: null,
              picture: null,
              created_at: 1,
              updated_at: 1,
              is_guest: 0,
              expires_at: null,
            } as T;
          }
          if (sql.includes('FROM user_preferences')) {
            const userId = bound[0] as string;
            return (
              [...store.preferences.values()].find(
                (r) => r.user_id === userId,
              ) ?? null
            ) as T;
          }
          if (sql.includes('FROM shopping_list_items') && sql.includes('checked = 0')) {
            const [userId, name, unit] = bound as [string, string, string];
            return (
              [...store.shopping.values()]
                .filter(
                  (r) =>
                    r.user_id === userId &&
                    r.checked === 0 &&
                    r.name.trim().toLowerCase() === name.toLowerCase() &&
                    (r.unit?.trim() || 'pcs').toLowerCase() === unit.toLowerCase(),
                )
                .sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0))[0] ?? null
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
          queries.push(sql);
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
            rows = rows.sort(
              (a, b) =>
                (a.created_at ?? 0) - (b.created_at ?? 0) || a.id.localeCompare(b.id),
            );
            if (sql.includes('LIMIT ? OFFSET ?')) {
              const [limit, offset] = bound.slice(-2) as [number, number];
              rows = rows.slice(offset, offset + limit);
            }
            return { results: rows as T[] };
          }
          if (sql.includes('FROM recipe_ingredients') && sql.includes('recipe_id IN')) {
            const ids = new Set(bound as string[]);
            return {
              results: [...store.recipeIngredients.values()]
                .filter((r) => ids.has(r.recipe_id))
                .sort((a, b) => a.sort_order - b.sort_order) as T[],
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
          queries.push(sql);
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
              assume_basic_seasonings: 1,
              created_at: createdAt,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE user_preferences')) {
            const hasAssume = sql.includes('assume_basic_seasonings');
            const householdNotes = bound[0] as string;
            const measurementUnit = bound[1] as string;
            const notes = bound[2] as string;
            const allergies = bound[3] as string;
            const dislikes = bound[4] as string;
            const likes = bound[5] as string;
            const dietary = bound[6] as string;
            const assume = hasAssume ? Number(bound[7]) : 1;
            const updatedAt = (hasAssume ? bound[8] : bound[7]) as number;
            const userId = (hasAssume ? bound[9] : bound[8]) as string;
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
              assume_basic_seasonings: assume,
              updated_at: updatedAt,
            });
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO shopping_list_items')) {
            const hasSyncFlag = sql.includes('has_been_added_to_pantry');
            if (hasSyncFlag) {
              const [
                id,
                userId,
                name,
                quantity,
                unit,
                checked,
                ingredientId,
                hasBeenAdded,
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
                has_been_added_to_pantry: hasBeenAdded,
                created_at: createdAt,
                updated_at: updatedAt,
              });
            } else {
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
                has_been_added_to_pantry: 0,
                created_at: createdAt,
                updated_at: updatedAt,
              });
            }
            return { meta: { changes: 1 } };
          }
          if (sql.includes('UPDATE shopping_list_items')) {
            // Flag-only: SET has_been_added_to_pantry = ?, updated_at = ? WHERE id = ? AND user_id = ?
            if (
              sql.includes('SET has_been_added_to_pantry = ?') &&
              !sql.includes('SET name = ?') &&
              !sql.includes('SET quantity = ?')
            ) {
              const [hasBeenAdded, updatedAt, id, userId] = bound as [
                number,
                number,
                string,
                string,
              ];
              const row = store.shopping.get(id);
              if (!row || row.user_id !== userId) {
                return { meta: { changes: 0 } };
              }
              store.shopping.set(id, {
                ...row,
                has_been_added_to_pantry: hasBeenAdded,
                updated_at: updatedAt,
              });
              return { meta: { changes: 1 } };
            }
            // Qty/unit + flag: SET quantity = ?, unit = ?, has_been_added_to_pantry = 1, updated_at = ?
            if (
              sql.includes('SET quantity = ?') &&
              sql.includes('has_been_added_to_pantry') &&
              !sql.includes('SET name = ?')
            ) {
              const [quantity, unit, updatedAt, id, userId] = bound as [
                string,
                string,
                number,
                string,
                string,
              ];
              const row = store.shopping.get(id);
              if (!row || row.user_id !== userId) {
                return { meta: { changes: 0 } };
              }
              store.shopping.set(id, {
                ...row,
                quantity,
                unit,
                has_been_added_to_pantry: 1,
                updated_at: updatedAt,
              });
              return { meta: { changes: 1 } };
            }
            const hasSyncFlag = sql.includes('has_been_added_to_pantry');
            if (hasSyncFlag) {
              const [
                name,
                quantity,
                unit,
                checked,
                ingredientId,
                hasBeenAdded,
                updatedAt,
                id,
                userId,
              ] = bound as [
                string,
                string,
                string,
                number,
                string | null,
                number,
                number,
                string,
                string,
              ];
              const row = store.shopping.get(id);
              if (!row || row.user_id !== userId) {
                return { meta: { changes: 0 } };
              }
              store.shopping.set(id, {
                ...row,
                name,
                quantity,
                unit,
                checked,
                ingredient_id: ingredientId,
                has_been_added_to_pantry: hasBeenAdded,
                updated_at: updatedAt,
              });
              return { meta: { changes: 1 } };
            }
            const [name, quantity, unit, checked, ingredientId, updatedAt, id, userId] =
              bound as [
                string,
                string,
                string,
                number,
                string | null,
                number,
                string,
                string,
              ];
            const row = store.shopping.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            store.shopping.set(id, {
              ...row,
              name,
              quantity,
              unit,
              checked,
              ingredient_id: ingredientId,
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
          if (sql.includes('UPDATE meal_plans SET status = ?, updated_at = ?')) {
            const [status, updatedAt, id, userId] = bound as [string, number, string, string];
            const row = store.mealPlans.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            store.mealPlans.set(id, { ...row, status, updated_at: updatedAt });
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
          if (sql.includes('UPDATE pantry_items SET quantity = ?, updated_at = ?')) {
            const [quantity, updatedAt, id, userId] = bound as [string, number, string, string];
            const row = store.pantry.get(id);
            if (!row || row.user_id !== userId) return { meta: { changes: 0 } };
            store.pantry.set(id, { ...row, quantity, updated_at: updatedAt });
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
          if (sql.includes('DELETE FROM recipe_ingredients')) {
            const recipeId = bound[0] as string;
            let changes = 0;
            for (const [k, v] of [...store.recipeIngredients]) {
              if (v.recipe_id === recipeId) {
                store.recipeIngredients.delete(k);
                changes += 1;
              }
            }
            return { meta: { changes } };
          }
          if (sql.includes('DELETE FROM meal_plans')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.mealPlans.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            store.mealPlans.delete(id);
            return { meta: { changes: 1 } };
          }
          if (sql.includes('DELETE FROM pantry_items')) {
            const id = bound[0] as string;
            const userId = bound[1] as string;
            const row = store.pantry.get(id);
            if (!row || row.user_id !== userId) {
              return { meta: { changes: 0 } };
            }
            store.pantry.delete(id);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };

  return { db: db as unknown as D1Database, store, queries, batches };
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
      data: {
        allergies: string[];
        measurementUnit: string;
        assumeBasicSeasonings: boolean;
      };
    };
    expect(getBody.data.allergies).toEqual([]);
    expect(getBody.data.measurementUnit).toBe('metric');
    expect(getBody.data.assumeBasicSeasonings).toBe(true);

    const putRes = await app.request(
      '/api/user-preferences',
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          allergies: ['peanut'],
          measurementUnit: 'imperial',
          householdNotes: 'No nuts',
          assumeBasicSeasonings: false,
        }),
      },
      env,
    );
    expect(putRes.status).toBe(200);
    const putBody = (await putRes.json()) as {
      data: {
        allergies: string[];
        measurementUnit: string;
        householdNotes: string;
        assumeBasicSeasonings: boolean;
      };
    };
    expect(putBody.data.allergies).toEqual(['peanut']);
    expect(putBody.data.measurementUnit).toBe('imperial');
    expect(putBody.data.householdNotes).toBe('No nuts');
    expect(putBody.data.assumeBasicSeasonings).toBe(false);
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

  it('checking a shopping item does not add to pantry', async () => {
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
          name: 'Garlic',
          quantity: 1,
          unit: 'pack',
          checked: false,
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      data: { id: string; synced_to_pantry: boolean };
    };
    expect(created.data.synced_to_pantry).toBe(false);

    const check = await app.request(
      `/api/shopping-list/${created.data.id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ checked: true }),
      },
      env,
    );
    expect(check.status).toBe(200);
    const checkedBody = (await check.json()) as {
      data: { checked: boolean; synced_to_pantry: boolean };
    };
    expect(checkedBody.data.checked).toBe(true);
    expect(checkedBody.data.synced_to_pantry).toBe(false);

    const pantry = await app.request('/api/pantry-item', { headers }, env);
    const pantryBody = (await pantry.json()) as {
      data: Array<{ name: string }>;
    };
    expect(pantryBody.data).toHaveLength(0);
  });

  it('batch sync adds to pantry once; resync skips; unsync restores', async () => {
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
          name: 'Garlic',
          quantity: 1,
          unit: 'pack',
          checked: false,
        }),
      },
      env,
    );
    const created = (await create.json()) as { data: { id: string } };
    const id = created.data.id;

    await app.request(
      `/api/shopping-list/${id}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ checked: true }),
      },
      env,
    );

    const sync = await app.request(
      '/api/shopping-list/sync-to-pantry',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: [{ id }] }),
      },
      env,
    );
    expect(sync.status).toBe(200);
    const syncBody = (await sync.json()) as {
      data: {
        synced: Array<{ id: string; synced_to_pantry: boolean }>;
        skipped: unknown[];
      };
    };
    expect(syncBody.data.synced).toHaveLength(1);
    expect(syncBody.data.synced[0].synced_to_pantry).toBe(true);
    expect(syncBody.data.skipped).toHaveLength(0);

    const pantryAfter = await app.request('/api/pantry-item', { headers }, env);
    const pantryAfterBody = (await pantryAfter.json()) as {
      data: Array<{ name: string; quantity: number; unit: string }>;
    };
    expect(pantryAfterBody.data).toHaveLength(1);
    expect(pantryAfterBody.data[0].name).toBe('Garlic');
    expect(pantryAfterBody.data[0].quantity).toBe(1);
    expect(pantryAfterBody.data[0].unit).toBe('pack');

    const syncAgain = await app.request(
      '/api/shopping-list/sync-to-pantry',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: [{ id }] }),
      },
      env,
    );
    const syncAgainBody = (await syncAgain.json()) as {
      data: {
        synced: unknown[];
        skipped: Array<{ id: string; reason: string }>;
      };
    };
    expect(syncAgainBody.data.synced).toHaveLength(0);
    expect(syncAgainBody.data.skipped).toEqual([
      { id, reason: 'already_synced' },
    ]);

    const pantryIdempotent = await app.request(
      '/api/pantry-item',
      { headers },
      env,
    );
    const pantryIdempotentBody = (await pantryIdempotent.json()) as {
      data: Array<{ quantity: number }>;
    };
    expect(pantryIdempotentBody.data[0].quantity).toBe(1);

    const unsync = await app.request(
      '/api/shopping-list/unsync-from-pantry',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ item_ids: [id] }),
      },
      env,
    );
    expect(unsync.status).toBe(200);
    const unsyncBody = (await unsync.json()) as {
      data: {
        unsynced: Array<{ synced_to_pantry: boolean }>;
        skipped: unknown[];
      };
    };
    expect(unsyncBody.data.unsynced).toHaveLength(1);
    expect(unsyncBody.data.unsynced[0].synced_to_pantry).toBe(false);

    const pantryAfterUnsync = await app.request(
      '/api/pantry-item',
      { headers },
      env,
    );
    const pantryAfterUnsyncBody = (await pantryAfterUnsync.json()) as {
      data: Array<{ quantity: number }>;
    };
    // Undo removes the row the check-off created: no "0 pcs" ghost row.
    expect(pantryAfterUnsyncBody.data).toEqual([]);
  });

  it('creating a shopping item already checked does not sync until batch', async () => {
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
          name: 'Onion',
          quantity: 3,
          unit: 'pcs',
          checked: true,
        }),
      },
      env,
    );
    expect(create.status).toBe(201);
    const created = (await create.json()) as {
      data: { id: string; synced_to_pantry: boolean };
    };
    expect(created.data.synced_to_pantry).toBe(false);

    const pantryBefore = await app.request('/api/pantry-item', { headers }, env);
    const pantryBeforeBody = (await pantryBefore.json()) as {
      data: unknown[];
    };
    expect(pantryBeforeBody.data).toHaveLength(0);

    const sync = await app.request(
      '/api/shopping-list/sync-to-pantry',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          items: [{ id: created.data.id, quantity: 5, unit: 'pcs' }],
        }),
      },
      env,
    );
    expect(sync.status).toBe(200);

    const pantry = await app.request('/api/pantry-item', { headers }, env);
    const pantryBody = (await pantry.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(pantryBody.data).toHaveLength(1);
    expect(pantryBody.data[0].name).toBe('Onion');
    expect(pantryBody.data[0].quantity).toBe(5);
  });

  it('sync skips unchecked items', async () => {
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
          quantity: 1,
          unit: 'L',
          checked: false,
        }),
      },
      env,
    );
    const created = (await create.json()) as { data: { id: string } };

    const sync = await app.request(
      '/api/shopping-list/sync-to-pantry',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ items: [{ id: created.data.id }] }),
      },
      env,
    );
    expect(sync.status).toBe(200);
    const syncBody = (await sync.json()) as {
      data: {
        synced: unknown[];
        skipped: Array<{ id: string; reason: string }>;
      };
    };
    expect(syncBody.data.synced).toHaveLength(0);
    expect(syncBody.data.skipped).toEqual([
      { id: created.data.id, reason: 'not_checked' },
    ]);
  });

  it('GET /api/folder ensures default folders including Uncategorized', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
    };

    const first = await app.request('/api/folder', { headers }, env);
    expect(first.status).toBe(200);
    const firstBody = (await first.json()) as {
      data: Array<{ name: string }>;
    };
    const names = firstBody.data.map((f) => f.name);
    expect(names).toContain('Uncategorized');
    expect(names).toEqual(
      expect.arrayContaining([
        'Uncategorized',
        'Favorites',
        'Breakfast',
        'Lunch',
        'Dinner',
      ]),
    );

    const second = await app.request('/api/folder', { headers }, env);
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      data: Array<{ name: string }>;
    };
    expect(secondBody.data).toHaveLength(firstBody.data.length);
    expect(
      secondBody.data.filter((f) => f.name.toLowerCase() === 'uncategorized'),
    ).toHaveLength(1);
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

  it('meal-plan availability is read-only and week-allocates pantry', async () => {
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
          meal_name: 'Chicken Bowl',
          instructions: ['Cook'],
          ingredients: [{ name: 'Chicken', quantity: 200, unit: 'g' }],
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
        body: JSON.stringify({ name: 'Chicken', quantity: 250, unit: 'g' }),
      },
      env,
    );

    const plan1 = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-06',
          recipe_id: recipeBody.data.id,
          meal_name: 'Chicken Bowl',
        }),
      },
      env,
    );
    const plan1Body = (await plan1.json()) as { data: { id: string } };

    const plan2 = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-07',
          recipe_id: recipeBody.data.id,
          meal_name: 'Chicken Bowl',
        }),
      },
      env,
    );
    const plan2Body = (await plan2.json()) as { data: { id: string } };

    const availRes = await app.request(
      '/api/meal-plan/availability?from=2026-10-06&to=2026-10-12',
      { headers },
      env,
    );
    expect(availRes.status).toBe(200);
    const availBody = (await availRes.json()) as {
      data: {
        meals: Array<{
          meal_plan_id: string;
          serving_date: string;
          meal_name: string;
          meal_type: string;
          recipe_id: string | null;
          status: string;
          shortages: Array<{ name: string }>;
        }>;
        weekShortages: Array<{ name: string; needed: number; available: number }>;
      };
    };

    const byId = Object.fromEntries(
      availBody.data.meals.map((m) => [m.meal_plan_id, m]),
    );
    expect(byId[plan1Body.data.id]?.status).toBe('ok');
    expect(byId[plan1Body.data.id]?.serving_date).toBe('2026-10-06');
    expect(byId[plan1Body.data.id]?.meal_name).toBeTruthy();
    expect(byId[plan1Body.data.id]?.meal_type).toBeTruthy();
    expect(byId[plan2Body.data.id]?.status).toBe('short');
    expect(byId[plan2Body.data.id]?.serving_date).toBe('2026-10-07');
    expect(byId[plan2Body.data.id]?.meal_name).toBe('Chicken Bowl');
    expect(byId[plan2Body.data.id]?.meal_type).toBe('dinner');
    expect(availBody.data.weekShortages.length).toBeGreaterThan(0);
    expect(availBody.data.weekShortages[0].name).toBe('Chicken');
    expect(availBody.data.weekShortages[0].available).toBe(0);

    const pantryList = await app.request('/api/pantry-item', { headers }, env);
    const pantryBody = (await pantryList.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    const chicken = pantryBody.data.find((p) => p.name === 'Chicken');
    expect(chicken?.quantity).toBe(250);
  });

  it('meal-plan availability rejects bad dates', async () => {
    const headers = { Authorization: await authHeader(USER_A) };
    const res = await app.request(
      '/api/meal-plan/availability?from=2026-10-12&to=2026-10-01',
      { headers },
      env,
    );
    expect(res.status).toBe(400);
  });

  it('closed-loop: multi-meal shortages stay attributed to each dish', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };

    const kungPaoRes = await app.request(
      '/api/recipe',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_name: '宮保雞丁',
          instructions: ['Stir-fry'],
          ingredients: [
            { name: '雞胸肉', quantity: 300, unit: 'g' },
            { name: '花生', quantity: 50, unit: 'g' },
          ],
        }),
      },
      env,
    );
    const kungPaoBody = (await kungPaoRes.json()) as { data: { id: string } };

    const soupRes = await app.request(
      '/api/recipe',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_name: '山藥排骨湯',
          instructions: ['Simmer'],
          ingredients: [
            { name: '排骨', quantity: 500, unit: 'g' },
            { name: '山藥', quantity: 200, unit: 'g' },
          ],
        }),
      },
      env,
    );
    const soupBody = (await soupRes.json()) as { data: { id: string } };

    const planKung = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-15',
          recipe_id: kungPaoBody.data.id,
          meal_name: '宮保雞丁',
        }),
      },
      env,
    );
    const planKungBody = (await planKung.json()) as { data: { id: string } };

    const planSoup = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-16',
          recipe_id: soupBody.data.id,
          meal_name: '山藥排骨湯',
        }),
      },
      env,
    );
    const planSoupBody = (await planSoup.json()) as { data: { id: string } };

    const availRes = await app.request(
      '/api/meal-plan/availability?from=2026-10-15&to=2026-10-18',
      { headers },
      env,
    );
    expect(availRes.status).toBe(200);
    const availBody = (await availRes.json()) as {
      data: {
        meals: Array<{
          meal_plan_id: string;
          serving_date: string;
          meal_name: string;
          status: string;
          shortages: Array<{ name: string }>;
        }>;
        weekShortages: Array<{ name: string }>;
      };
    };

    const byId = Object.fromEntries(
      availBody.data.meals.map((m) => [m.meal_plan_id, m]),
    );
    const kung = byId[planKungBody.data.id]!;
    const soup = byId[planSoupBody.data.id]!;

    expect(kung.serving_date).toBe('2026-10-15');
    expect(kung.meal_name).toBe('宮保雞丁');
    expect(kung.status).toBe('short');
    expect(soup.serving_date).toBe('2026-10-16');
    expect(soup.meal_name).toBe('山藥排骨湯');
    expect(soup.status).toBe('short');

    const kungNames = kung.shortages.map((s) => s.name);
    const soupNames = soup.shortages.map((s) => s.name);
    expect(kungNames).toEqual(expect.arrayContaining(['雞胸肉', '花生']));
    expect(kungNames).not.toContain('排骨');
    expect(kungNames).not.toContain('山藥');
    expect(soupNames).toEqual(expect.arrayContaining(['排骨', '山藥']));
    expect(soupNames).not.toContain('雞胸肉');
    expect(soupNames).not.toContain('花生');

    const weekNames = availBody.data.weekShortages.map((s) => s.name);
    expect(weekNames).toEqual(
      expect.arrayContaining(['雞胸肉', '花生', '排骨', '山藥']),
    );
  });

  it('closed-loop: skip/delete meal releases soft-reserve; pantry qty unchanged', async () => {
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
          meal_name: 'Chicken Bowl',
          instructions: ['Cook'],
          ingredients: [{ name: 'Chicken', quantity: 200, unit: 'g' }],
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
        body: JSON.stringify({ name: 'Chicken', quantity: 250, unit: 'g' }),
      },
      env,
    );

    const plan1 = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-06',
          recipe_id: recipeBody.data.id,
          meal_name: 'Chicken Bowl',
        }),
      },
      env,
    );
    const plan1Body = (await plan1.json()) as { data: { id: string } };

    const plan2 = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-07',
          recipe_id: recipeBody.data.id,
          meal_name: 'Chicken Bowl',
        }),
      },
      env,
    );
    const plan2Body = (await plan2.json()) as { data: { id: string } };

    const availBefore = await app.request(
      '/api/meal-plan/availability?from=2026-10-06&to=2026-10-12',
      { headers },
      env,
    );
    const beforeBody = (await availBefore.json()) as {
      data: {
        meals: Array<{ meal_plan_id: string; status: string }>;
      };
    };
    const beforeById = Object.fromEntries(
      beforeBody.data.meals.map((m) => [m.meal_plan_id, m]),
    );
    expect(beforeById[plan1Body.data.id]?.status).toBe('ok');
    expect(beforeById[plan2Body.data.id]?.status).toBe('short');

    const pantryBefore = await app.request('/api/pantry-item', { headers }, env);
    const pantryBeforeBody = (await pantryBefore.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(
      pantryBeforeBody.data.find((p) => p.name === 'Chicken')?.quantity,
    ).toBe(250);

    const skipRes = await app.request(
      `/api/meal-plan/${plan1Body.data.id}/skip`,
      { method: 'POST', headers },
      env,
    );
    expect(skipRes.status).toBe(200);

    const availAfterSkip = await app.request(
      '/api/meal-plan/availability?from=2026-10-06&to=2026-10-12',
      { headers },
      env,
    );
    const afterSkipBody = (await availAfterSkip.json()) as {
      data: {
        meals: Array<{ meal_plan_id: string; status: string }>;
      };
    };
    const afterSkipById = Object.fromEntries(
      afterSkipBody.data.meals.map((m) => [m.meal_plan_id, m]),
    );
    expect(afterSkipById[plan2Body.data.id]?.status).toBe('ok');

    const pantryAfterSkip = await app.request(
      '/api/pantry-item',
      { headers },
      env,
    );
    const pantryAfterSkipBody = (await pantryAfterSkip.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(
      pantryAfterSkipBody.data.find((p) => p.name === 'Chicken')?.quantity,
    ).toBe(250);

    const delRes = await app.request(
      `/api/meal-plan/${plan2Body.data.id}`,
      { method: 'DELETE', headers },
      env,
    );
    expect(delRes.status).toBe(200);

    const availAfterDelete = await app.request(
      '/api/meal-plan/availability?from=2026-10-06&to=2026-10-12',
      { headers },
      env,
    );
    const afterDeleteBody = (await availAfterDelete.json()) as {
      data: { meals: Array<{ meal_plan_id: string }> };
    };
    expect(
      afterDeleteBody.data.meals.some((m) => m.meal_plan_id === plan2Body.data.id),
    ).toBe(false);

    const pantryAfterDelete = await app.request(
      '/api/pantry-item',
      { headers },
      env,
    );
    const pantryAfterDeleteBody = (await pantryAfterDelete.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(
      pantryAfterDeleteBody.data.find((p) => p.name === 'Chicken')?.quantity,
    ).toBe(250);
  });

  it('closed-loop: schedule does not deduct; confirm deducts pantry', async () => {
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
          serving_date: '2026-09-21',
          recipe_id: recipeBody.data.id,
          meal_name: 'Eggs',
        }),
      },
      env,
    );
    const planBody = (await planRes.json()) as { data: { id: string } };

    const pantryAfterPlan = await app.request(
      '/api/pantry-item',
      { headers },
      env,
    );
    const afterPlanBody = (await pantryAfterPlan.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(afterPlanBody.data.find((p) => p.name === 'Egg')?.quantity).toBe(5);

    const confirmRes = await app.request(
      `/api/meal-plan/${planBody.data.id}/confirm`,
      { method: 'POST', headers },
      env,
    );
    expect(confirmRes.status).toBe(200);

    const pantryAfterConfirm = await app.request(
      '/api/pantry-item',
      { headers },
      env,
    );
    const afterConfirmBody = (await pantryAfterConfirm.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(afterConfirmBody.data.find((p) => p.name === 'Egg')?.quantity).toBe(
      3,
    );
  });

  it('closed-loop: shopping POST merges qty by name+unit on unchecked row', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };

    const first = await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: '蒜頭',
          quantity: 2,
          unit: '顆',
          details: { quantity: 2, unit: '顆', checked: false },
        }),
      },
      env,
    );
    expect(first.status).toBe(201);

    const second = await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: '蒜頭',
          quantity: 3,
          unit: '顆',
          details: { quantity: 3, unit: '顆', checked: false },
        }),
      },
      env,
    );
    expect(second.status).toBe(201);
    const secondBody = (await second.json()) as {
      data: { quantity: number; name: string };
    };
    expect(secondBody.data.quantity).toBe(5);

    const list = await app.request('/api/shopping-list', { headers }, env);
    const listBody = (await list.json()) as {
      data: Array<{ name: string; quantity: number; unit: string }>;
    };
    const garlic = listBody.data.filter((i) => i.name === '蒜頭');
    expect(garlic).toHaveLength(1);
    expect(garlic[0].quantity).toBe(5);
    expect(garlic[0].unit).toBe('顆');
  });

  it('closed-loop: skip meal leaves shopping list unchanged (v1)', async () => {
    const headers = {
      Authorization: await authHeader(USER_A),
      'Content-Type': 'application/json',
    };

    await app.request(
      '/api/shopping-list',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: '青木瓜',
          quantity: 1,
          unit: '個',
          details: { quantity: 1, unit: '個', checked: false },
        }),
      },
      env,
    );

    const recipeRes = await app.request(
      '/api/recipe',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_name: '青木瓜排骨湯',
          instructions: ['Simmer'],
          ingredients: [{ name: '青木瓜', quantity: 1, unit: '個' }],
        }),
      },
      env,
    );
    const recipeBody = (await recipeRes.json()) as { data: { id: string } };

    const planRes = await app.request(
      '/api/meal-plan',
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          meal_type: 'dinner',
          serving_date: '2026-10-17',
          recipe_id: recipeBody.data.id,
          meal_name: '青木瓜排骨湯',
        }),
      },
      env,
    );
    const planBody = (await planRes.json()) as { data: { id: string } };

    const skipRes = await app.request(
      `/api/meal-plan/${planBody.data.id}/skip`,
      { method: 'POST', headers },
      env,
    );
    expect(skipRes.status).toBe(200);

    const list = await app.request('/api/shopping-list', { headers }, env);
    const listBody = (await list.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(listBody.data.find((i) => i.name === '青木瓜')?.quantity).toBe(1);
  });

  it('closed-loop: confirm deletes pantry row when qty reaches 0', async () => {
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
          ingredients: [{ name: 'Egg', quantity: 3, unit: 'pcs' }],
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
        body: JSON.stringify({ name: 'Egg', quantity: 3, unit: 'pcs' }),
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
          serving_date: '2026-09-22',
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

    const pantryList = await app.request('/api/pantry-item', { headers }, env);
    const pantryBody = (await pantryList.json()) as {
      data: Array<{ name: string; quantity: number }>;
    };
    expect(pantryBody.data.find((p) => p.name === 'Egg')).toBeUndefined();
  });
});

describe('launch hardening: batching and query counts', () => {
  let mock: ReturnType<typeof createMockDb>;
  let app: Hono<{ Bindings: Env }>;
  let env: Env;

  const j = async (path: string, init: RequestInit = {}) =>
    app.request(
      path,
      {
        ...init,
        headers: {
          Authorization: await authHeader(USER_A),
          'Content-Type': 'application/json',
        },
      },
      env,
    );
  const post = (path: string, body: unknown) =>
    j(path, { method: 'POST', body: JSON.stringify(body) });

  beforeEach(() => {
    mock = createMockDb();
    ({ app, env } = createApp(mock.db));
  });

  it('createRecipe writes the recipe and all ingredients in ONE batch', async () => {
    const res = await post('/api/recipe', {
      meal_name: 'Stew',
      instructions: ['Cook'],
      ingredients: [
        { name: 'Beef', quantity: 500, unit: 'g' },
        { name: 'Onion', quantity: 2, unit: 'pcs' },
        { name: 'Salt', quantity: 1, unit: 'tsp' },
      ],
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      data: { id: string; ingredients: Array<{ name: string; quantity: number; unit: string }> };
    };
    expect(body.data.ingredients.map((i) => i.name)).toEqual(['Beef', 'Onion', 'Salt']);
    expect(body.data.ingredients[1]).toEqual({ name: 'Onion', quantity: 2, unit: 'pcs' });
    const recipeBatches = mock.batches.filter((b) => b.some((s) => s.includes('INSERT INTO recipes')));
    expect(recipeBatches).toHaveLength(1);
    expect(recipeBatches[0]!.filter((s) => s.includes('INSERT INTO recipe_ingredients'))).toHaveLength(3);
    // No re-select of the created recipe.
    expect(mock.queries.filter((q) => /SELECT/i.test(q) && q.includes('FROM recipe'))).toHaveLength(0);
    expect(mock.store.recipeIngredients.size).toBe(3);
  });

  it('updateRecipe replaces ingredients with DELETE + inserts in one batch', async () => {
    const created = (await (
      await post('/api/recipe', {
        meal_name: 'Stew',
        instructions: ['Cook'],
        ingredients: [{ name: 'Beef', quantity: 500, unit: 'g' }],
      })
    ).json()) as { data: { id: string } };
    mock.batches.length = 0;
    const res = await j(`/api/recipe/${created.data.id}`, {
      method: 'PUT',
      body: JSON.stringify({
        meal_name: 'Better Stew',
        ingredients: [
          { name: 'Lamb', quantity: 1, unit: 'kg' },
          { name: 'Leek', quantity: 3, unit: 'pcs' },
        ],
      }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { meal_name: string; instructions: string[]; ingredients: Array<{ name: string }> };
    };
    expect(body.data.meal_name).toBe('Better Stew');
    expect(body.data.instructions).toEqual(['Cook']);
    expect(body.data.ingredients.map((i) => i.name)).toEqual(['Lamb', 'Leek']);
    expect(mock.batches).toHaveLength(1);
    expect(mock.batches[0]!.map((s) => s.trim().split(/\s+/)[0])).toEqual([
      'UPDATE',
      'DELETE',
      'INSERT',
      'INSERT',
    ]);
    expect([...mock.store.recipeIngredients.values()].map((r) => r.name).sort()).toEqual([
      'Lamb',
      'Leek',
    ]);
  });

  it('recipe list uses one ingredient query regardless of recipe count; paging is optional', async () => {
    for (let i = 0; i < 5; i++) {
      await post('/api/recipe', {
        meal_name: `Dish ${i}`,
        instructions: [],
        ingredients: [
          { name: `A${i}`, quantity: 1, unit: 'pcs' },
          { name: `B${i}`, quantity: 2, unit: 'g' },
        ],
      });
    }
    mock.queries.length = 0;
    const all = (await (await j('/api/recipe')).json()) as {
      data: Array<{ meal_name: string; ingredients: Array<{ name: string }> }>;
    };
    expect(all.data).toHaveLength(5);
    expect(all.data.find((r) => r.meal_name === 'Dish 3')!.ingredients.map((x) => x.name)).toEqual(['A3', 'B3']);
    expect(mock.queries.filter((q) => q.includes('FROM recipe_ingredients'))).toHaveLength(1);

    const paged = (await (await j('/api/recipe?limit=2&cursor=0')).json()) as {
      data: Array<{ meal_name: string }>;
    };
    expect(paged.data).toHaveLength(2);
    expect((await j('/api/recipe?limit=abc')).status).toBe(400);
  });

  async function seedWeek() {
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) {
      const r = (await (
        await post('/api/recipe', {
          meal_name: `Meal ${i}`,
          instructions: [],
          ingredients: [
            { name: 'Egg', quantity: 1, unit: 'pcs' },
            { name: `Herb${i}`, quantity: 1, unit: 'pcs' },
            { name: 'Flour', quantity: 100, unit: 'g' },
          ],
        })
      ).json()) as { data: { id: string } };
      ids.push(r.data.id);
    }
    await post('/api/pantry-item', { name: 'Egg', quantity: 10, unit: 'pcs' });
    await post('/api/pantry-item', { name: 'Flour', quantity: 1, unit: 'kg' });
    const plans: string[] = [];
    for (let i = 0; i < 4; i++) {
      const p = (await (
        await post('/api/meal-plan', {
          meal_type: 'dinner',
          serving_date: `2026-09-2${i}`,
          recipe_id: ids[i],
          meal_name: `Meal ${i}`,
        })
      ).json()) as { data: { id: string } };
      plans.push(p.data.id);
    }
    return plans;
  }

  it('week availability runs a constant number of queries (no per-meal lookups)', async () => {
    await seedWeek();
    mock.queries.length = 0;
    const res = await j('/api/meal-plan/availability?from=2026-09-20&to=2026-09-23');
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { meals: Array<{ status: string }>; weekShortages: Array<{ name: string }> };
    };
    expect(body.data.meals).toHaveLength(4);
    expect(body.data.weekShortages.map((s) => s.name).sort()).toEqual([
      'Herb0',
      'Herb1',
      'Herb2',
      'Herb3',
    ]);
    // plans + pantry + recipes + one grouped ingredients query (+ nothing per meal).
    expect(mock.queries.filter((q) => q.includes('FROM recipe_ingredients'))).toHaveLength(1);
    expect(mock.queries.filter((q) => q.includes('FROM recipes'))).toHaveLength(1);
    expect(mock.queries.filter((q) => q.includes('FROM meal_plans'))).toHaveLength(1);
    expect(mock.queries.filter((q) => q.includes('FROM pantry_items'))).toHaveLength(1);
    expect(mock.queries.length).toBeLessThanOrEqual(5);
  });

  it('confirm loads the pantry once and applies all deductions in one batch', async () => {
    const plans = await seedWeek();
    mock.queries.length = 0;
    mock.batches.length = 0;
    const res = await j(`/api/meal-plan/${plans[0]}/confirm`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: {
        mealPlan: { status: string };
        deducted: Array<{ name: string; new_quantity: number }>;
        shortages: Array<{ name: string }>;
      };
    };
    expect(body.data.mealPlan.status).toBe('CONFIRMED');
    expect(body.data.deducted.map((d) => d.name).sort()).toEqual(['Egg', 'Flour']);
    expect(body.data.shortages.map((s) => s.name)).toEqual(['Herb0']);
    expect(mock.queries.filter((q) => q.includes('FROM pantry_items'))).toHaveLength(1);
    expect(mock.batches).toHaveLength(1);
    expect(mock.batches[0]!.map((s) => s.trim().split(' ')[0])).toEqual([
      'UPDATE',
      'UPDATE',
      'UPDATE',
    ]);
    const pantry = [...mock.store.pantry.values()];
    expect(pantry.find((p) => p.name === 'Egg')!.quantity).toBe('9');
    expect(pantry.find((p) => p.name === 'Flour')!.quantity).toBe('0.9');
    expect([...mock.store.mealPlans.values()].find((p) => p.id === plans[0])!.status).toBe(
      'CONFIRMED',
    );
  });

  it('meal-plan list accepts an optional from/to window and rejects bad dates', async () => {
    await seedWeek();
    expect((await j('/api/meal-plan?from=bad')).status).toBe(400);
    const all = (await (await j('/api/meal-plan')).json()) as { data: unknown[] };
    expect(all.data).toHaveLength(4);
    mock.queries.length = 0;
    await j('/api/meal-plan?from=2026-09-21&to=2026-09-22');
    expect(mock.queries.some((q) => q.includes('serving_date >= ?') && q.includes('serving_date <= ?'))).toBe(true);
  });

  it('GET /api/folder seeds only missing defaults in one batch and skips the second read', async () => {
    mock.queries.length = 0;
    mock.batches.length = 0;
    const first = (await (await j('/api/folder')).json()) as { data: Array<{ name: string }> };
    expect(first.data.map((f) => f.name)).toEqual([
      'Uncategorized',
      'Favorites',
      'Breakfast',
      'Lunch',
      'Dinner',
    ]);
    expect(mock.batches).toHaveLength(1);
    expect(mock.batches[0]).toHaveLength(5);
    expect(mock.queries.filter((q) => q.includes('SELECT') && q.includes('FROM folders'))).toHaveLength(1);

    mock.queries.length = 0;
    mock.batches.length = 0;
    const second = (await (await j('/api/folder')).json()) as { data: unknown[] };
    expect(second.data).toHaveLength(5);
    expect(mock.batches).toHaveLength(0);
    expect(mock.queries.filter((q) => q.includes('FROM folders'))).toHaveLength(1);
  });
});
