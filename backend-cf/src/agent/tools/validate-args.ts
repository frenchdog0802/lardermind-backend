import { COOKING_TOOLS } from './definitions';

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  enum?: unknown[];
  additionalProperties?: boolean;
  oneOf?: JsonSchema[];
};

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
      return [`${path || 'value'} does not match schema`];
    }
    return [];
  }

  if (schema.type === 'object' || schema.properties || schema.required) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return [`${path || 'value'} must be an object`];
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
    if (!Array.isArray(value)) return [`${path || 'value'} must be an array`];
    if (!schema.items) return [];
    const errors: string[] = [];
    value.forEach((item, index) => {
      errors.push(
        ...validateAgainstSchema(schema.items as JsonSchema, item, `${path}[${index}]`),
      );
    });
    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') return [`${path || 'value'} must be a string`];
    if (schema.enum && !schema.enum.includes(value)) {
      return [`${path || 'value'} is invalid`];
    }
    return [];
  }

  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return [`${path || 'value'} must be a number`];
    }
    return [];
  }

  if (schema.type === 'boolean') {
    if (typeof value !== 'boolean') return [`${path || 'value'} must be a boolean`];
    return [];
  }

  if (schema.enum && !schema.enum.includes(value)) {
    return [`${path || 'value'} is invalid`];
  }
  return [];
}

export function validateToolArgs(
  name: string,
  args: Record<string, unknown>,
): string[] {
  const tool = COOKING_TOOLS.find((entry) => entry.function.name === name);
  if (!tool) return [`Unknown tool ${name}`];
  const parameters = tool.function.parameters as JsonSchema;
  return validateAgainstSchema(parameters, args);
}
