import type { FieldPrimitive, MonitorField } from './monitor-editor-state';

export type ParsedMonitorJson = {
  fields: MonitorField[];
  nextFieldKey: number;
};

/**
 * Converts a representative JSON object into editable field definitions.
 * This is deliberately pure: callers own the draft lifecycle and decide
 * when parsed fields become the active editor state.
 */
export function parseMonitorJsonDraft(json: string, firstFieldKey: number): ParsedMonitorJson {
  const value: unknown = JSON.parse(json);
  const fields: MonitorField[] = [];
  let nextFieldKey = firstFieldKey;

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Paste a JSON object at the top level.');
  }

  const visit = (node: unknown, path: string) => {
    if (node && typeof node === 'object' && !Array.isArray(node)) {
      for (const [key, child] of Object.entries(node as Record<string, unknown>)) {
        visit(child, path ? `${path}.${key}` : key);
      }
      return;
    }

    if (Array.isArray(node) || node === undefined) return;
    const primitive: FieldPrimitive = typeof node === 'boolean'
      ? 'boolean'
      : typeof node === 'number'
        ? 'count'
        : 'text';
    fields.push({
      key: nextFieldKey++,
      name: path.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || `field_${fields.length + 1}`,
      path,
      primitive,
    });
  };

  visit(value, '');
  if (!fields.length) {
    throw new Error('No scalar values were found. Include at least one number, string, boolean, or null value.');
  }
  if (fields.length > 50) throw new Error('This editor supports up to 50 fields.');

  return { fields, nextFieldKey };
}

/**
 * Produces an editable JSON example from the current field definitions.
 * Path conflicts are reported before the draft is replaced.
 */
export function buildMonitorJsonDraft(fields: MonitorField[]): string {
  const nested: Record<string, unknown> = {};

  for (const field of fields) {
    const path = field.path.trim();
    if (!field.name.trim() || !path) {
      throw new Error('Complete or remove blank field rows before switching to JSON.');
    }
    if (path.split('.').some((part) => !part.trim())) {
      throw new Error(`The path “${path}” contains an empty segment.`);
    }

    const parts = path.split('.');
    let cursor: Record<string, unknown> = nested;
    for (let index = 0; index < parts.length - 1; index += 1) {
      const part = parts[index];
      if (!part || (cursor[part] !== undefined && (!cursor[part] || typeof cursor[part] !== 'object' || Array.isArray(cursor[part])))) {
        throw new Error(`The path “${path}” conflicts with another field.`);
      }
      cursor[part] = cursor[part] ?? {};
      cursor = cursor[part] as Record<string, unknown>;
    }

    const leaf = parts[parts.length - 1];
    if (!leaf || cursor[leaf] !== undefined) {
      throw new Error(`The path “${path}” is duplicated or conflicts with another field.`);
    }
    cursor[leaf] = field.primitive === 'boolean'
      ? true
      : field.primitive === 'count' || field.primitive === 'size' || field.primitive === 'duration'
        ? 0
        : field.primitive === 'timestamp'
          ? '2026-01-01T00:00:00Z'
          : field.primitive === 'checksum'
            ? 'sha256-example'
            : 'example';
  }

  return JSON.stringify(nested, null, 2);
}
