import type { LlmToolDefinition } from '../../lib/llm-chat';
import { APP_UNITS } from '../../db/units';

/** The only units the app understands; tools map anything else onto these. */
const UNIT_ENUM = [...APP_UNITS];
const UNIT_RULE =
  'Must be one of the app units: g, kg, oz, lb, ml, l, tsp, tbsp, cup, pcs, clove, can, slice, stalk, bunch. Never invent units (no bottle, carton, loaf, pack). Liquids (milk, oil) use ml or l; bread/eggs/fruit use pcs (bread may use slice); dry goods use g or kg.';

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
      description:
        'Suggest saved recipes that match pantry ingredients. Each suggestion has cookStatus (cookable | conditionally_cookable | uncookable), missingMains, conditionalSeasonings. actions with action_required define_unit mean a unit card is shown to the user; call this tool again after they define the conversion.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addPantryItems',
      description:
        'Add or merge-add items into the pantry (requires approval). Use name/unit in the same language as the user message. Do not invent quantities the user did not state — ask, or use 1 and say it was assumed.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Item name in the user message language.',
                },
                quantity: { type: 'number' },
                unit: {
                  type: 'string',
                  enum: UNIT_ENUM,
                  description: UNIT_RULE,
                },
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
                unit: {
                  type: 'string',
                  enum: UNIT_ENUM,
                  description: `Unit of the quantity. ${UNIT_RULE}`,
                },
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
      description:
        'Add items to the shopping list (requires approval). Use name/unit in the same language as the user message.',
      parameters: {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  description: 'Item name in the user message language.',
                },
                quantity: { type: 'number' },
                unit: {
                  type: 'string',
                  enum: UNIT_ENUM,
                  description: UNIT_RULE,
                },
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
      description:
        'Create a NEW recipe (requires approval). If a recipe with the same meal_name already exists, use updateRecipe instead unless the user explicitly wants another copy.',
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
                unit: {
                  type: 'string',
                  enum: UNIT_ENUM,
                  description: `Unit from the recipe text (cup and tbsp stay cup/tbsp; do not convert to ml). ${UNIT_RULE}`,
                },
              },
              required: ['name', 'unit'],
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
      name: 'updateRecipe',
      description:
        'Update an existing recipe in place (requires approval). Prefer over createRecipe when the user asks to edit/update a recipe. Pass recipe_id from listMyRecipes or getRecipeDetails.',
      parameters: {
        type: 'object',
        properties: {
          recipe_id: { type: 'string' },
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
                unit: {
                  type: 'string',
                  enum: UNIT_ENUM,
                  description: `Unit from the recipe text (do not convert cups/tbsp to ml). ${UNIT_RULE}`,
                },
              },
              required: ['name', 'unit'],
            },
          },
          folder_id: { type: 'string' },
        },
        required: ['recipe_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'addRecipeToMenu',
      description:
        'Schedule ONE dish on the meal plan (requires approval). Pass recipe_id and/or meal_name (at least one; the server takes the name from the recipe when meal_name is empty and rejects a nameless meal). For several dishes or days use planMeals.',
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
        'Schedule multiple dishes on the calendar (requires approval). Prefer over repeated addRecipeToMenu for multi-day plans. A slot may hold several dishes: add one entry per dish (main, side, soup) with the same serving_date and meal_type; never merge dishes into one name. Include every dish of the plan the user confirmed (max 28 entries per call). Result: created (saved rows), createdCount, requested, byDate {date: {meal_type: names}}, existingInSlot (meals already in those slots before this call), errors, truncated — report only what is in created/byDate and name anything not saved. Does not deduct pantry; soft-reserves only.',
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
        "Read-only: week-allocate pantry against planned meals. Returns meals[] each with serving_date, meal_name, meal_type, status (ok | short | unknown), and that meal's shortages. Narrate per meal first: for each short entry give its serving_date, meal_name and only its own shortages. Never put meal A's shortages under meal B's heading, and do not invent doubt that a list belongs to another dish. status unknown = no usable recipe; say it cannot be scored, do not fabricate ingredients. Shortage reason unit_mismatch = ask how to convert. weekShortages/shoppingHints are a deduped aggregate for an optional shopping offer only, after the per-meal breakdown (or when the user asks for one combined cart); to add them use addMealPlanShortagesToShoppingList. Does not write pantry.",
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
      name: 'addMealPlanShortagesToShoppingList',
      description:
        'Add ONLY the missing ingredients for planned meals in a date range to the shopping list (requires approval). The server computes needed minus what the pantry already has (unit- and name-aware) — the same numbers the Calendar shows — and skips what is already on the list. Prefer this over addItemsToShoppingList for meal-plan shopping; never compute quantities yourself.',
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
          assumeBasicSeasonings: {
            type: 'boolean',
            description:
              'When true, recipes missing only default staples (oil, salt, soy, etc.) are conditionally cookable.',
          },
        },
      },
    },
  },
];

export function listToolNames(): string[] {
  return COOKING_TOOLS.map((t) => t.function.name);
}

export function cookingToolsForGuest(
  allowlist: Set<string>,
): typeof COOKING_TOOLS {
  return COOKING_TOOLS.filter((t) => allowlist.has(t.function.name));
}
