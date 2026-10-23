import * as v from 'valibot';
import { parseCronExpression } from 'cron-schedule';
import cronstrue from 'cronstrue';
import { fieldPrimitiveToValue, type MonitorEditorDraft, type MonitorField } from './monitor-editor-state';
import { formatMonitorCadence } from './monitor-format';

const monitorIdentitySchema = v.object({
  name: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1, 'Enter a monitor name between 1 and 200 characters.'),
    v.maxLength(200, 'Enter a monitor name between 1 and 200 characters.'),
  ),
  description: v.pipe(
    v.string(),
    v.maxLength(2000, 'Description must be 2,000 characters or fewer.'),
  ),
});

export type MonitorIdentityValidation =
  | { ok: true; name: string; description: string }
  | { ok: false; error: string };

export function validateMonitorIdentity(name: string, description: string): MonitorIdentityValidation {
  const result = v.safeParse(monitorIdentitySchema, { name, description });
  if (!result.success) {
    return { ok: false, error: result.issues[0]?.message ?? 'Check the monitor name and description.' };
  }
  return { ok: true, name: result.output.name, description: result.output.description };
}

export type CadenceResolution =
  | { ok: true; seconds: number; preview: string }
  | { ok: false; error: string };

export function resolveMonitorCadence(draft: Pick<MonitorEditorDraft, 'cadenceMode' | 'cadenceValue' | 'cadenceUnit' | 'cronExpression'>): CadenceResolution {
  if (draft.cadenceMode === 'interval') {
    const value = Number(draft.cadenceValue);
    const multiplier = draft.cadenceUnit === 'hours' ? 3600 : draft.cadenceUnit === 'minutes' ? 60 : 1;
    const seconds = value * multiplier;
    if (!Number.isSafeInteger(value) || value <= 0 || !Number.isSafeInteger(seconds)) {
      return { ok: false, error: 'Enter a whole, positive interval.' };
    }
    if (seconds < 15) {
      return { ok: false, error: 'The minimum interval is 15 seconds.' };
    }
    return { ok: true, seconds, preview: `Every ${formatMonitorCadence(seconds)}` };
  }

  const expression = draft.cronExpression.trim();
  const secondsMatch = expression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*\s+\*$/);
  const minutesMatch = expression.match(/^\*\/(\d+)\s+\*\s+\*\s+\*\s+\*$/);

  // Parse with the cron library first, but deliberately keep TrueExit's narrower
  // fixed-interval contract instead of accepting arbitrary valid cron schedules.
  try {
    parseCronExpression(expression);
  } catch {
    return {
      ok: false,
      error: 'Enter a valid cron expression using the supported fixed-interval format.',
    };
  }

  let seconds: number | null = null;
  if (secondsMatch) {
    const step = Number(secondsMatch[1]);
    if ([15, 20, 30].includes(step)) seconds = step;
  } else if (minutesMatch) {
    const step = Number(minutesMatch[1]);
    if (step > 0 && step <= 60 && 60 % step === 0) seconds = step * 60;
  }
  if (!seconds || !Number.isSafeInteger(seconds) || seconds < 15) {
    return {
      ok: false,
      error: 'Use a fixed-interval expression such as */30 * * * * * (seconds) or */5 * * * * (minutes). The minimum interval is 15 seconds.',
    };
  }

  let description = `Every ${formatMonitorCadence(seconds)}`;
  try {
    description = cronstrue.toString(expression, { throwExceptionOnParseError: true });
  } catch {
    // The interval remains valid under the product-specific rules; keep a safe fallback.
  }
  return {
    ok: true,
    seconds,
    preview: `${description} · ${secondsMatch ? 'seconds-level cron' : 'minute-level cron'}`,
  };
}

const CHECKSUM_ALGORITHM_SHA256 = 0;
const CHECKSUM_ENCODING_HEXADECIMAL = 0;

export type MonitorConfigValidation =
  | { ok: true; config: { fields: Record<string, unknown>[] } }
  | { ok: false; error: string };

export function buildMonitorConfig(fields: MonitorField[]): MonitorConfigValidation {
  const seen = new Set<string>();
  const names = new Set<string>();
  const paths = new Set<string>();
  const configuredFields: Record<string, unknown>[] = [];

  for (const field of fields) {
    const name = field.name.trim();
    const path = field.path.trim();
    if (!name || !path || path.split('.').some((part) => !part.trim())) {
      return { ok: false, error: 'Every field needs a name and a dot-separated JSON path.' };
    }
    if (names.has(name)) {
      return { ok: false, error: `Field name “${name}” is repeated. Field names must be unique.` };
    }
    names.add(name);
    if (paths.has(path)) {
      return { ok: false, error: `JSON path “${path}” is repeated. Each configured field needs a unique path.` };
    }
    if ([...paths].some((existing) => existing.startsWith(`${path}.`) || path.startsWith(`${existing}.`))) {
      return { ok: false, error: `JSON path “${path}” conflicts with a parent or child field path.` };
    }
    paths.add(path);
    if (field.primitive === 'timestamp') {
      if (seen.has('timestamp')) {
        return { ok: false, error: 'Only one Timestamp field can be configured.' };
      }
      seen.add('timestamp');
    }
    const item: Record<string, unknown> = { name, path, primitive: fieldPrimitiveToValue(field.primitive) };
    if (field.primitive === 'checksum') {
      item.meta = {
        checksum: {
          algorithm: CHECKSUM_ALGORITHM_SHA256,
          encoding: CHECKSUM_ENCODING_HEXADECIMAL,
        },
      };
    }
    configuredFields.push(item);
  }

  if (configuredFields.length === 0) {
    return { ok: false, error: 'Add at least one configured field before creating this monitor.' };
  }
  return { ok: true, config: { fields: configuredFields } };
}

export type MonitorSubmissionValidation =
  | {
      ok: true;
      name: string;
      description: string;
      cadenceSeconds: number;
      cadencePreview: string;
      config: { fields: Record<string, unknown>[] };
    }
  | { ok: false; field: 'identity' | 'cadence' | 'fields'; error: string };

/** Runs the same business validation for create and edit submissions. */
export function prepareMonitorSubmission(draft: MonitorEditorDraft): MonitorSubmissionValidation {
  const identity = validateMonitorIdentity(draft.name, draft.description);
  if (!identity.ok) return { ok: false, field: 'identity', error: identity.error };

  const cadence = resolveMonitorCadence(draft);
  if (!cadence.ok) return { ok: false, field: 'cadence', error: cadence.error };

  const configuration = buildMonitorConfig(draft.fields);
  if (!configuration.ok) return { ok: false, field: 'fields', error: configuration.error };

  return {
    ok: true,
    name: identity.name,
    description: identity.description,
    cadenceSeconds: cadence.seconds,
    cadencePreview: cadence.preview,
    config: configuration.config,
  };
}
