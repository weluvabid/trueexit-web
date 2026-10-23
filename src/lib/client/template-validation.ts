import type { FieldDefinition } from './template-types';
import { isPrimitiveValue, isTimestampPrimitive } from './field-primitives';
import { findConflictingFieldPath, hasDuplicateValues, isValidFieldPath, normalizeFieldName, normalizeFieldPath } from './field-definition-rules';

export type TemplateDraft = {
  name: string;
  description: string;
  fields: FieldDefinition[];
};

export function validateTemplateDraft({ name, description, fields }: TemplateDraft): string | null {
  const normalizedName = name.trim();
  if (!normalizedName) return 'Give this template a name.';
  if (normalizedName.length > 120) return 'Template names must be 120 characters or fewer.';
  if (description.length > 1000) return 'Descriptions must be 1,000 characters or fewer.';

  // Blank editor rows remain allowed; only fully specified rows are submitted.
  const valid = fields.filter((field) => normalizeFieldName(field.name) && normalizeFieldPath(field.path));
  if (!valid.length) return 'Add at least one field with a name and JSON path.';

  const names = valid.map((field) => normalizeFieldName(field.name));
  if (hasDuplicateValues(names)) return 'Field names must be unique.';

  const paths: string[] = [];
  for (const field of valid) {
    const path = normalizeFieldPath(field.path);
    if (!isValidFieldPath(path)) {
      return 'Every field needs a valid dot-separated JSON path.';
    }
    const conflict = findConflictingFieldPath(path, paths);
    if (conflict !== null) {
      return conflict === path
        ? 'JSON paths must be unique.'
        : 'JSON paths cannot conflict with a parent or child field path.';
    }
    paths.push(path);
  }

  if (valid.filter((field) => isTimestampPrimitive(field.primitive)).length > 1) {
    return 'Only one field can use the Timestamp primitive.';
  }
  if (valid.some((field) => !isPrimitiveValue(field.primitive))) {
    return 'Choose a valid primitive for every field.';
  }

  return null;
}
