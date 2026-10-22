import { formatDateTime } from './date-format';

export function formatInvestigationDate(value: unknown): string {
  return formatDateTime(value);
}

export function formatInvestigationValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'string') return value;
  try { return JSON.stringify(value); } catch { return String(value); }
}

export function formatInvestigationLabel(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Unknown';
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function getHealthCounts(summary: Record<string, unknown> | null | undefined): Array<[string, unknown]> {
  if (!summary) return [];
  return ['field_count', 'normal', 'suspected', 'confirmed', 'ongoing', 'recovered', 'unknown']
    .filter((key) => key in summary)
    .map((key) => [key, summary[key]]);
}
