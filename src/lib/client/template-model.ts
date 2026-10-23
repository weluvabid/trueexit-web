import type { FieldDefinition } from './template-types';
import type { TemplateDraft } from './template-validation';

export type TemplateDraftSource = Pick<TemplateDraft, 'name' | 'description' | 'fields'>;

export type TemplatePayload = {
  workspace_id: string;
  name: string;
  description: string;
  fields: FieldDefinition[];
};

export type SamplePayloadParseResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; reason: 'invalid_json' | 'not_object' };

/** Build an editable draft without sharing the template's mutable field objects. */
export function createTemplateDraft(template: TemplateDraftSource): TemplateDraft {
  return {
    name: template.name,
    description: template.description ?? '',
    fields: template.fields.map((field) => ({ ...field })),
  };
}

/** Normalize a draft into the request shape expected by template create/update endpoints. */
export function buildTemplatePayload(
  workspaceId: string,
  draft: TemplateDraftSource,
): TemplatePayload {
  return {
    workspace_id: workspaceId,
    name: draft.name.trim(),
    description: draft.description.trim(),
    fields: draft.fields
      .filter((field) => field.name.trim() && field.path.trim())
      .map((field) => ({
        ...field,
        name: field.name.trim(),
        path: field.path.trim(),
      })),
  };
}

/** Parse a sample as a JSON object, keeping syntax and shape failures distinct. */
export function parseSamplePayload(input: string): SamplePayloadParseResult {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch {
    return { ok: false, reason: 'invalid_json' };
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return { ok: false, reason: 'not_object' };
  }

  return { ok: true, value: value as Record<string, unknown> };
}
