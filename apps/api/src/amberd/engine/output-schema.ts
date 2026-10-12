import { OutputSchemaNode } from '@app-starter/shared';

/**
 * Convert an agent's declared output schema into the strict form the model API
 * requires: every object closed with `additionalProperties: false` and every
 * property listed in `required`.
 */
export const toStrictJsonSchema = (node: OutputSchemaNode): Record<string, unknown> => {
  const base: Record<string, unknown> = { type: node.type };
  if (node.description) base.description = node.description;
  if (node.enum) base.enum = node.enum;
  if (node.type === 'object' && node.properties) {
    const properties: Record<string, unknown> = {};
    Object.entries(node.properties).forEach(([key, child]) => {
      properties[key] = toStrictJsonSchema(child);
    });
    base.properties = properties;
    base.required = Object.keys(node.properties);
    base.additionalProperties = false;
  }
  if (node.type === 'array' && node.items) base.items = toStrictJsonSchema(node.items);
  return base;
};

/**
 * Validate model output against the declared schema in application code, so
 * a malformed response fails the run even if the provider let it through.
 */
export const validateOutput = (node: OutputSchemaNode, value: unknown, path = 'output'): string[] => {
  const errors: string[] = [];
  switch (node.type) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return [`${path} must be an object`];
      }
      const record = value as Record<string, unknown>;
      const required = node.required ?? Object.keys(node.properties ?? {});
      required.forEach((key) => {
        if (!(key in record)) errors.push(`${path}.${key} is missing`);
      });
      Object.entries(node.properties ?? {}).forEach(([key, child]) => {
        if (key in record) errors.push(...validateOutput(child, record[key], `${path}.${key}`));
      });
      return errors;
    }
    case 'array':
      if (!Array.isArray(value)) return [`${path} must be an array`];
      if (node.items) value.forEach((item, i) => errors.push(...validateOutput(node.items!, item, `${path}[${i}]`)));
      return errors;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? [] : [`${path} must be a number`];
    case 'integer':
      return Number.isInteger(value) ? [] : [`${path} must be an integer`];
    case 'boolean':
      return typeof value === 'boolean' ? [] : [`${path} must be a boolean`];
    case 'string':
      if (typeof value !== 'string') return [`${path} must be a string`];
      if (node.enum && !node.enum.includes(value)) return [`${path} must be one of ${node.enum.join(', ')}`];
      return [];
  }
};

/** Read a dotted path such as `invoice.stated_total` from a result object. */
export const readPath = (source: Record<string, unknown>, path: string): unknown =>
  path.split('.').reduce<unknown>((current, key) => {
    if (typeof current !== 'object' || current === null) return undefined;
    return (current as Record<string, unknown>)[key];
  }, source);
