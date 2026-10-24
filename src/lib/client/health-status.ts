/** Stable health states exposed by the backend health API. */
export type HealthState =
  | 'normal'
  | 'suspected'
  | 'confirmed'
  | 'ongoing'
  | 'recovered'
  | 'unknown';

const HEALTH_STATE_CLASSES: Record<HealthState, string> = {
  normal: 'border-status-success-border bg-status-success-background text-status-success',
  suspected: 'border-status-warning-border bg-status-warning-background text-status-warning',
  confirmed: 'border-status-error-border bg-status-error-background text-status-error',
  ongoing: 'border-status-error-border bg-status-error-background text-status-error',
  recovered: 'border-status-info-border bg-status-info-background text-status-info',
  unknown: 'border-status-neutral-border bg-status-neutral-background text-status-neutral',
};

const HEALTH_STATE_TEXT_CLASSES: Record<HealthState, string> = {
  normal: 'text-status-success',
  suspected: 'text-status-warning',
  confirmed: 'text-status-error',
  ongoing: 'text-status-error',
  recovered: 'text-status-info',
  unknown: 'text-status-neutral',
};

const HEALTH_STATES = new Set<HealthState>([
  'normal',
  'suspected',
  'confirmed',
  'ongoing',
  'recovered',
  'unknown',
]);

/**
 * Normalize backend state strings defensively. Missing or unrecognized states
 * stay neutral and must never be presented as healthy.
 */
export function normalizeHealthState(value: unknown): HealthState {
  if (typeof value !== 'string') return 'unknown';
  return HEALTH_STATES.has(value as HealthState) ? (value as HealthState) : 'unknown';
}

export function getHealthStateClasses(value: unknown): string {
  return HEALTH_STATE_CLASSES[normalizeHealthState(value)];
}

export function getHealthStateTextClass(value: unknown): string {
  return HEALTH_STATE_TEXT_CLASSES[normalizeHealthState(value)];
}

export function getHealthStateLabel(value: unknown): string {
  const state = normalizeHealthState(value);
  return state.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}
