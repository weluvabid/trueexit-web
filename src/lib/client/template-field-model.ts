import type { FieldDefinition } from './template-types';
import { PrimitiveCode, isPrimitiveValue } from './field-primitives';

export function addTemplateField(fields: FieldDefinition[]): FieldDefinition[] {
  return [...fields, { name: '', path: '', primitive: PrimitiveCode.count }];
}

export function removeTemplateField(fields: FieldDefinition[], index: number): FieldDefinition[] {
  return fields.length > 1 ? fields.filter((_, fieldIndex) => fieldIndex !== index) : fields;
}

export function updateTemplateField(
  fields: FieldDefinition[],
  index: number,
  key: keyof FieldDefinition,
  value: string | number,
): FieldDefinition[] {
  return fields.map((field, fieldIndex) => {
    if (fieldIndex !== index) return field;

    switch (key) {
      case 'name':
        return { ...field, name: String(value) };
      case 'path':
        return { ...field, path: String(value) };
      case 'primitive':
        if (!isPrimitiveValue(value)) return field;
        return { ...field, primitive: value };
      case 'meta':
        return field;
    }
  });
}

export function discoveredFieldKey(field: Pick<FieldDefinition, 'name' | 'path'>): string {
  return `${field.name}\u0000${field.path}`;
}

export function mergeDiscoveredFields(
  current: FieldDefinition[],
  discovered: FieldDefinition[],
  selectedKeys: string[],
): FieldDefinition[] {
  const chosen = discovered.filter((field) => selectedKeys.includes(discoveredFieldKey(field)));
  if (!chosen.length) return current;

  const combined = [
    ...current.filter((field) => field.name.trim() || field.path.trim()),
    ...chosen.map(({ name, path, primitive, meta }) => ({ name, path, primitive, ...(meta ? { meta } : {}) })),
  ];
  const unique = new Map<string, FieldDefinition>();
  for (const field of combined) unique.set(discoveredFieldKey(field), field);
  return unique.size ? [...unique.values()] : [{ name: '', path: '', primitive: PrimitiveCode.count }];
}
