import { formatDateTime } from './date-format';

export function formatMonitorDate(value: string): string {
  return formatDateTime(value);
}

export function formatMonitorCadence(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'Cadence unavailable';
  if (seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? '' : 's'}`;
  if (seconds % 3600 === 0) return `${seconds / 3600} hour${seconds === 3600 ? '' : 's'}`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return `${seconds} sec`;
}
