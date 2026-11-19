import { getPantryItem, findPantryByNameLoose } from '../../db/pantry';
import { getRecipe } from '../../db/recipe';

export type MissingTarget = {
  tool: string;
  id?: string;
  name?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function pantryTargetExists(
  db: D1Database,
  userId: string,
  item: Record<string, unknown>,
): Promise<boolean> {
  const id = asString(item.pantry_item_id);
  if (id) {
    const row = await getPantryItem(db, userId, id);
    return row != null;
  }
  const name = asString(item.name);
  if (!name) return false;
  const row = await findPantryByNameLoose(db, userId, name);
  return row != null;
}

/**
 * Re-read rows a mutating tool would change. Creates (add pantry, new recipe,
 * shopping add, preference upsert) have no prior row and pass.
 */
export async function recheckMutatingTargets(
  db: D1Database,
  userId: string,
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
): Promise<MissingTarget[]> {
  const missing: MissingTarget[] = [];
  // A recipe created earlier in the same approved batch does not exist yet.
  const batchCreatesRecipes = toolCalls.some((c) => c.name === 'createRecipe');

  for (const call of toolCalls) {
    if (call.name === 'updatePantryItems' || call.name === 'removePantryItems') {
      const items = Array.isArray(call.arguments.items) ? call.arguments.items : [];
      for (const raw of items) {
        const item = asRecord(raw);
        if (!item) {
          missing.push({ tool: call.name });
          continue;
        }
        const exists = await pantryTargetExists(db, userId, item);
        if (!exists) {
          missing.push({
            tool: call.name,
            id: asString(item.pantry_item_id) || undefined,
            name: asString(item.name) || undefined,
          });
        }
      }
    }

    // Recipe ids are only a link: execute falls back to a meal_name match (or an
    // unlinked meal), so a stale / unknown recipe_id must not block approval when
    // the slot still has a meal_name or the batch creates the recipe.
    if (call.name === 'addRecipeToMenu') {
      const recipeId = asString(call.arguments.recipe_id);
      if (recipeId && !asString(call.arguments.meal_name) && !batchCreatesRecipes) {
        const recipe = await getRecipe(db, userId, recipeId);
        if (!recipe) missing.push({ tool: call.name, id: recipeId });
      }
    }

    if (call.name === 'planMeals') {
      const meals = Array.isArray(call.arguments.meals) ? call.arguments.meals : [];
      for (const raw of meals) {
        const meal = asRecord(raw);
        if (!meal) continue;
        const recipeId = asString(meal.recipe_id);
        if (!recipeId || asString(meal.meal_name) || batchCreatesRecipes) continue;
        const recipe = await getRecipe(db, userId, recipeId);
        if (!recipe) missing.push({ tool: call.name, id: recipeId });
      }
    }
  }

  return missing;
}
