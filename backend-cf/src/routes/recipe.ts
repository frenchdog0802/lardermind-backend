import { Hono } from 'hono';
import { fail, ok } from '../lib/api-response';
import type { Env } from '../env';
import type { AuthVariables } from '../middleware/auth';
import { requireAuth } from '../middleware/auth';
import {
  createRecipe,
  deleteRecipe,
  getRecipeDto,
  listRecipeIngredientRows,
  listRecipes,
  toRecipeDto,
  updateRecipe,
  type RecipeIngredientInput,
  type RecipeInput,
  type RecipePatch,
} from '../db/recipe';

export const recipeRoutes = new Hono<{
  Bindings: Env;
  Variables: AuthVariables;
}>();

recipeRoutes.use('/api/recipe', requireAuth);
recipeRoutes.use('/api/recipe/*', requireAuth);

type LooseRecord = Record<string, unknown>;

function asRecord(value: unknown): LooseRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as LooseRecord)
    : null;
}

function parseQuantity(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) ? n : null;
}

function parseIngredients(raw: unknown): RecipeIngredientInput[] {
  if (!Array.isArray(raw)) return [];
  const result: RecipeIngredientInput[] = [];
  for (const item of raw) {
    const row = asRecord(item);
    if (!row) continue;
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (!name) continue;
    const quantity = parseQuantity(row.quantity);
    if (quantity === null) continue;
    const unit =
      typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : 'pcs';
    const ing: RecipeIngredientInput = { name, quantity, unit };
    if (typeof row.ingredient_id === 'string' && row.ingredient_id.trim()) {
      ing.ingredient_id = row.ingredient_id.trim();
    }
    result.push(ing);
  }
  return result;
}

function parseImage(
  root: LooseRecord,
): { image_url?: string; image_public_id?: string } {
  const image = asRecord(root.image);
  if (image) {
    const out: { image_url?: string; image_public_id?: string } = {};
    if (typeof image.url === 'string') out.image_url = image.url;
    if (typeof image.public_id === 'string') {
      out.image_public_id = image.public_id;
    }
    return out;
  }
  const out: { image_url?: string; image_public_id?: string } = {};
  if (typeof root.image_url === 'string') out.image_url = root.image_url;
  if (typeof root.image_public_id === 'string') {
    out.image_public_id = root.image_public_id;
  }
  return out;
}

function parseCreateInput(
  body: unknown,
): { ok: true; value: RecipeInput } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };

  const mealName =
    typeof root.meal_name === 'string' ? root.meal_name.trim() : '';
  if (!mealName) return { ok: false, message: 'meal_name is required' };

  const value: RecipeInput = {
    meal_name: mealName,
    instructions:
      typeof root.instructions === 'string' || Array.isArray(root.instructions)
        ? (root.instructions as string | string[])
        : '',
    ingredients: parseIngredients(root.ingredients),
  };

  if (typeof root.folder_id === 'string' && root.folder_id.trim()) {
    value.folder_id = root.folder_id.trim();
  }

  const image = parseImage(root);
  if (image.image_url) value.image_url = image.image_url;
  if (image.image_public_id) value.image_public_id = image.image_public_id;

  return { ok: true, value };
}

function parsePatchInput(
  body: unknown,
): { ok: true; value: RecipePatch } | { ok: false; message: string } {
  const root = asRecord(body);
  if (!root) return { ok: false, message: 'Invalid body' };
  const patch: RecipePatch = {};

  if (root.meal_name !== undefined) {
    if (typeof root.meal_name !== 'string' || !root.meal_name.trim()) {
      return { ok: false, message: 'meal_name is required' };
    }
    patch.meal_name = root.meal_name.trim();
  }
  if (root.folder_id !== undefined) {
    patch.folder_id =
      typeof root.folder_id === 'string' ? root.folder_id.trim() : '';
  }
  if (root.instructions !== undefined) {
    patch.instructions =
      typeof root.instructions === 'string' || Array.isArray(root.instructions)
        ? (root.instructions as string | string[])
        : '';
  }
  if (root.ingredients !== undefined) {
    patch.ingredients = parseIngredients(root.ingredients);
  }

  const image = parseImage(root);
  if (image.image_url !== undefined) patch.image_url = image.image_url;
  if (image.image_public_id !== undefined) {
    patch.image_public_id = image.image_public_id;
  }
  if (root.image_url !== undefined && typeof root.image_url === 'string') {
    patch.image_url = root.image_url;
  }

  return { ok: true, value: patch };
}

recipeRoutes.get('/api/recipe', async (c) => {
  const userId = c.get('userId');
  const rows = await listRecipes(c.env.DB, userId, c.req.query('q'));
  const dtos = await Promise.all(
    rows.map(async (row) => {
      const ingredients = await listRecipeIngredientRows(c.env.DB, row.id);
      return toRecipeDto(row, ingredients);
    }),
  );
  return c.json(ok(dtos));
});

recipeRoutes.post('/api/recipe', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parseCreateInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const dto = await createRecipe(c.env.DB, userId, parsed.value);
  return c.json(ok(dto), 201);
});

recipeRoutes.get('/api/recipe/:id', async (c) => {
  const userId = c.get('userId');
  const dto = await getRecipeDto(c.env.DB, userId, c.req.param('id'));
  if (!dto) return c.json(fail('Not found'), 404);
  return c.json(ok(dto));
});

recipeRoutes.put('/api/recipe/:id', async (c) => {
  const userId = c.get('userId');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(fail('Invalid JSON'), 400);
  }
  const parsed = parsePatchInput(body);
  if (!parsed.ok) return c.json(fail(parsed.message), 400);

  const updated = await updateRecipe(
    c.env.DB,
    userId,
    c.req.param('id'),
    parsed.value,
  );
  if (!updated) return c.json(fail('Not found'), 404);
  return c.json(ok(updated));
});

recipeRoutes.delete('/api/recipe/:id', async (c) => {
  const userId = c.get('userId');
  const deleted = await deleteRecipe(c.env.DB, userId, c.req.param('id'));
  if (!deleted) return c.json(fail('Not found'), 404);
  return c.json(ok(null));
});
