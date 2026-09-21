import type { LlmToolDefinition } from '../../lib/llm-chat';

export const COOKING_TOOLS: LlmToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'listPantry',
      description: 'List the user pantry / inventory items.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listMyRecipes',
      description: 'List the user saved recipes.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getRecipeDetails',
      description: 'Get one recipe by id.',
      parameters: {
        type: 'object',
        properties: { recipeId: { type: 'string' } },
        required: ['recipeId'],
        additionalProperties: false,
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'listMealPlans',
      description: 'List meal plans on the calendar.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getPreferences',
      description: 'Get user cooking preferences.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'suggestMealsFromPantry',
      description: 'Suggest saved recipes that match pantry ingredients.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addPantryItems',
      description: 'Add or merge-add items into the pantry (requires approval).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
              },
              required: ['name', 'quantity'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addItemsToShoppingList',
      description: 'Add items to the shopping list (requires approval).',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
              },
              required: ['name', 'quantity'],
            },
          },
        },
        required: ['items'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'createRecipe',
      description: 'Create a new recipe (requires approval).',
      parameters: {
        type: 'object',
        properties: {
          meal_name: { type: 'string' },
          instructions: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          ingredients: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                quantity: { type: 'number' },
                unit: { type: 'string' },
              },
              required: ['name'],
            },
          },
          folder_id: { type: 'string' },
        },
        required: ['meal_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addRecipeToMenu',
      description: 'Schedule a recipe on the meal plan (requires approval).',
      parameters: {
        type: 'object',
        properties: {
          recipe_id: { type: 'string' },
          meal_name: { type: 'string' },
          meal_type: {
            type: 'string',
            enum: ['breakfast', 'lunch', 'dinner', 'snack'],
          },
          serving_date: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['meal_type', 'serving_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'updatePreferences',
      description: 'Update user preferences (requires approval).',
      parameters: {
        type: 'object',
        properties: {
          allergies: { type: 'array', items: { type: 'string' } },
          dislikes: { type: 'array', items: { type: 'string' } },
          likes: { type: 'array', items: { type: 'string' } },
          dietaryRestrictions: { type: 'array', items: { type: 'string' } },
          householdNotes: { type: 'string' },
          measurementUnit: { type: 'string', enum: ['metric', 'imperial'] },
          notes: { type: 'string' },
        },
      },
    },
  },
];

export function listToolNames(): string[] {
  return COOKING_TOOLS.map((t) => t.function.name);
}
