import { COOKING_TOOLS, DATE_PATTERN, PLAN_MEALS_MAX_ENTRIES } from './definitions';

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean;
  oneOf?: JsonSchema[];
  /** Counted on the trimmed string, so whitespace-only names fail minLength: 1. */
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  exclusiveMinimum?: number;
};

function label(path: string): string {
  return path || 'value';
}

export function validateAgainstSchema(
  schema: JsonSchema,
  value: unknown,
  path = '',
): string[] {
  if (schema.oneOf && schema.oneOf.length > 0) {
    const matched = schema.oneOf.some(
      (option) => validateAgainstSchema(option, value).length === 0,
    );
    if (!matched) {
      return [`${label(path)} does not match schema`];
    }
    return [];
  }

  if (schema.type === 'object' || schema.properties || schema.required) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [`${label(path)} must be an object`];
    }
    const obj = value as Record<string, unknown>;
    const errors: string[] = [];
    const props = schema.properties ?? {};
    for (const key of schema.required ?? []) {
      if (obj[key] === undefined || obj[key] === null) {
        errors.push(`${path ? `${path}.` : ''}${key} is required`);
      }
    }
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(obj)) {
        if (!(key in props)) {
          errors.push(`${path ? `${path}.` : ''}${key} is not allowed`);
        }
      }
    }
    for (const [key, prop] of Object.entries(props)) {
      if (obj[key] !== undefined && obj[key] !== null) {
        errors.push(
          ...validateAgainstSchema(prop, obj[key], path ? `${path}.${key}` : key),
        );
      }
    }
    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${label(path)} must be an array`];
    const errors: string[] = [];
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      errors.push(`${label(path)} must have at least ${schema.minItems} item(s)`);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      errors.push(
        `${label(path)} has ${value.length} items; at most ${schema.maxItems} are allowed per call`,
      );
    }
    if (!schema.items) return errors;
    value.forEach((item, index) => {
      errors.push(
        ...validateAgainstSchema(schema.items as JsonSchema, item, `${path}[${index}]`),
      );
    });
    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') return [`${label(path)} must be a string`];
    if (schema.enum && !schema.enum.includes(value)) {
      return [`${label(path)} must be one of: ${schema.enum.join(', ')}`];
    }
    const length = value.trim().length;
    if (schema.minLength !== undefined && length < schema.minLength) {
      return [
        schema.minLength === 1
          ? `${label(path)} must not be empty`
          : `${label(path)} must be at least ${schema.minLength} characters`,
      ];
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return [`${label(path)} must be at most ${schema.maxLength} characters`];
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      return [
        schema.pattern === DATE_PATTERN
          ? `${label(path)} must be a YYYY-MM-DD date (got "${value.slice(0, 40)}")`
          : `${label(path)} has an invalid format`,
      ];
    }
    return [];
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [`${label(path)} must be a number`];
    }
    if (schema.exclusiveMinimum !== undefined && !(value > schema.exclusiveMinimum)) {
      return [`${label(path)} must be greater than ${schema.exclusiveMinimum}`];
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      return [`${label(path)} must be at least ${schema.minimum}`];
    }
    return [];
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') return [`${label(path)} must be a boolean`];
    return [];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return [`${label(path)} is invalid`];
  }
  return [];
}

function nonBlank(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Cross-field rules JSON Schema cannot express portably for the provider. */
const EXTRA_RULES: Record<string, (args: Record<string, unknown>) => string[]> = {
  addRecipeToMenu: (args) =>
    nonBlank(args.recipe_id) || nonBlank(args.meal_name)
      ? []
      : ['addRecipeToMenu needs recipe_id or meal_name (at least one)'],
  planMeals: (args) =>
    Array.isArray(args.meals) && args.meals.length > PLAN_MEALS_MAX_ENTRIES
      ? [
          `planMeals accepts at most ${PLAN_MEALS_MAX_ENTRIES} entries per call: schedule the first ${PLAN_MEALS_MAX_ENTRIES} and tell the user the rest were not scheduled (or split into a second planMeals call).`,
        ]
      : [],
};

export function validateToolArgs(
  name: string,
  args: Record<string, unknown>,
): string[] {
  const tool = COOKING_TOOLS.find((entry) => entry.function.name === name);
  if (!tool) return [`Unknown tool ${name}`];
  const parameters = tool.function.parameters as JsonSchema;
  return [
    ...validateAgainstSchema(parameters, args),
    ...(EXTRA_RULES[name]?.(args) ?? []),
  ];
}

/**
 * Tool-result payload returned to the model when a mutating call is rejected
 * before the approval card (nothing was saved, no approval was requested).
 */
export function invalidArgsToolContent(name: string, errors: string[]): string {
  return JSON.stringify({
    error: 'invalid_arguments',
    tool: name,
    errors: errors.slice(0, 10),
    message:
      'Nothing was saved and no approval was requested. Fix these arguments and call the tool again; do not tell the user this change was made.',
  });
}
