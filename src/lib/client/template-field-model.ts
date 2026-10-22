import type { FieldDefinition } from './template-types';

export function addTemplateField(fields: FieldDefinition[]): FieldDefinition[] {
  return [...fields, { name: '', path: '', primitive: 1 }];
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
  return fields.map((field, fieldIndex) =>
    fieldIndex === index ? { ...field, [key]: value } as FieldDefinition : field,
  );
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
  return unique.size ? [...unique.values()] : [{ name: '', path: '', primitive: 1 }];
}
