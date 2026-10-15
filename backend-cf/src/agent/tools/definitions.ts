import type { LlmToolDefinition } from '../../lib/llm-chat';

export const COOKING_TOOLS: LlmToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'listPantry',
      description:
        'List pantry items with on-hand quantity plus soft-reserve fields (reserved/available) for planned meals. quantity is on-hand; prefer available when planning.',
      parameters: {
        type: 'object',
        properties: {
          from: {
            type: 'string',
            description: 'YYYY-MM-DD soft-reserve window start (default: today UTC).',
          },
          to: {
            type: 'string',
            description: 'YYYY-MM-DD soft-reserve window end (default: from+14).',
          },
        },
        additionalProperties: false,
      },
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
      name: 'updatePantryItems',
      description:
        'Set or change pantry quantities (requires approval). Use delta for reduce/increase; quantity≤0 or result≤0 deletes the row. Do not use negative addPantryItems.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                pantry_item_id: { type: 'string' },
                quantity: {
                  type: 'number',
                  description: 'Absolute quantity when mode is set (default).',
                },
                delta: {
                  type: 'number',
                  description:
                    'Signed change when mode is delta (e.g. -3 to reduce by 3).',
                },
                mode: {
                  type: 'string',
                  enum: ['set', 'delta'],
                  description:
                    'set = absolute quantity; delta = add delta to current. Default: delta if delta provided, else set.',
                },
                unit: { type: 'string' },
              },
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
      name: 'removePantryItems',
      description:
        'Delete pantry items by name or id (requires approval). Missing items return per-item errors.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                pantry_item_id: { type: 'string' },
              },
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
          serving_date: {
            type: 'string',
            description:
              'YYYY-MM-DD. For 今天/today use the local calendar date from the system prompt.',
          },
        },
        required: ['meal_type', 'serving_date'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'planMeals',
      description:
        'Schedule multiple meals on the calendar (requires approval). Prefer over repeated addRecipeToMenu for multi-day plans. Does not deduct pantry; soft-reserves only.',
      parameters: {
        type: 'object',
        properties: {
          meals: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                meal_name: { type: 'string' },
                meal_type: {
                  type: 'string',
                  enum: ['breakfast', 'lunch', 'dinner', 'snack'],
                },
                serving_date: {
                  type: 'string',
                  description: 'YYYY-MM-DD',
                },
                recipe_id: { type: 'string' },
              },
              required: ['meal_name', 'meal_type', 'serving_date'],
            },
          },
        },
        required: ['meals'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'getMealPlanAvailability',
      description:
        'Read-only: week-allocate pantry against planned meals; return per-meal status and aggregated shortages (for shopping). Does not write pantry.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'YYYY-MM-DD' },
          to: { type: 'string', description: 'YYYY-MM-DD' },
        },
        required: ['from', 'to'],
        additionalProperties: false,
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
