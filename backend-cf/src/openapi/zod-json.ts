import type { ZodTypeAny } from 'zod';

type JsonSchema = Record<string, unknown>;

function unwrap(schema: ZodTypeAny): { schema: ZodTypeAny; nullable: boolean; optional: boolean } {
  let current = schema;
  let nullable = false;
  let optional = false;
  for (let i = 0; i < 6; i++) {
    const typeName = current._def?.typeName as string | undefined;
    if (typeName === 'ZodOptional') {
      optional = true;
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    if (typeName === 'ZodNullable') {
      nullable = true;
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    if (typeName === 'ZodDefault') {
      optional = true;
      current = current._def.innerType as ZodTypeAny;
      continue;
    }
    break;
  }
  return { schema: current, nullable, optional };
}

/** Small Zod 3 → OpenAPI 3 schema converter for the request bodies we publish. */
export function zodToOpenApiSchema(schema: ZodTypeAny): JsonSchema {
  const { schema: inner, nullable } = unwrap(schema);
  const typeName = inner._def?.typeName as string | undefined;
  let node: JsonSchema;

  if (typeName === 'ZodObject') {
    const shape = inner._def.shape() as Record<string, ZodTypeAny>;
    const properties: Record<string, JsonSchema> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      const field = unwrap(value);
      properties[key] = zodToOpenApiSchema(value);
      if (!field.optional) required.push(key);
    }
    node = {
      type: 'object',
      properties,
      additionalProperties: inner._def.unknownKeys === 'strict' ? false : true,
    };
    if (required.length) node.required = required;
  } else if (typeName === 'ZodString') {
    node = { type: 'string' };
  } else if (typeName === 'ZodNumber') {
    node = { type: 'number' };
    const checks = (inner._def.checks ?? []) as Array<{ kind: string }>;
    if (checks.some((c) => c.kind === 'int')) node.type = 'integer';
  } else if (typeName === 'ZodBoolean') {
    node = { type: 'boolean' };
  } else if (typeName === 'ZodEnum') {
    node = { type: 'string', enum: inner._def.values };
  } else if (typeName === 'ZodArray') {
    node = { type: 'array', items: zodToOpenApiSchema(inner._def.type as ZodTypeAny) };
  } else if (typeName === 'ZodUnion') {
    const options = inner._def.options as ZodTypeAny[];
    node = { anyOf: options.map((option) => zodToOpenApiSchema(option)) };
  } else if (typeName === 'ZodLiteral') {
    node = { const: inner._def.value };
  } else {
    node = {};
  }

  if (nullable) {
    return { anyOf: [node, { type: 'null' }] };
  }
  return node;
}
