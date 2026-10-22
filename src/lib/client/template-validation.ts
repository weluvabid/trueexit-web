import type { FieldDefinition } from './template-types';

export type TemplateDraft = {
  name: string;
  description: string;
  fields: FieldDefinition[];
};

export function validateTemplateDraft({ name, description, fields }: TemplateDraft): string | null {
  if (!name.trim()) return 'Give this template a name.';
  if (name.trim().length > 120) return 'Template names must be 120 characters or fewer.';
  if (description.length > 1000) return 'Descriptions must be 1,000 characters or fewer.';

  const valid = fields.filter((field) => field.name.trim() && field.path.trim());
  if (!valid.length) return 'Add at least one field with a name and JSON path.';

  const names = valid.map((field) => field.name.trim());
  if (new Set(names).size !== names.length) return 'Field names must be unique.';
  if (valid.filter((field) => field.primitive === 3).length > 1) {
    return 'Only one field can use the Timestamp primitive.';
  }
  if (valid.some((field) => !Number.isInteger(field.primitive) || field.primitive < 0 || field.primitive > 7)) {
    return 'Choose a valid primitive for every field.';
  }

  return null;
}
