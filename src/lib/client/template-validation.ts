import type { FieldDefinition, Primitive } from './template-types';

const TEMPLATE_TIMESTAMP_PRIMITIVE: Primitive = 3;
const MIN_TEMPLATE_PRIMITIVE = 0;
const MAX_TEMPLATE_PRIMITIVE = 7;

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
  if (valid.filter((field) => field.primitive === TEMPLATE_TIMESTAMP_PRIMITIVE).length > 1) {
    return 'Only one field can use the Timestamp primitive.';
  }
  if (valid.some((field) => !Number.isInteger(field.primitive) || field.primitive < MIN_TEMPLATE_PRIMITIVE || field.primitive > MAX_TEMPLATE_PRIMITIVE)) {
    return 'Choose a valid primitive for every field.';
  }

  return null;
}
