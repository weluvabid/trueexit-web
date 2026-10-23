import type { AttentionItem, DashboardSummary } from './dashboard-queries';
import { formatDateTime } from './date-format';

export type AttentionFilter = 'all' | AttentionItem['reason'];

export type DashboardSummaryMetrics = {
  monitorTotal: number;
  monitorCategoryTotal: number;
};

export function filterAttentionItems(
  items: readonly AttentionItem[],
  filter: AttentionFilter,
  limit = 5,
): AttentionItem[] {
  return items
    .filter((item) => filter === 'all' || item.reason === filter)
    .slice(0, Math.max(0, limit));
}

export function getDashboardSummaryMetrics(
  summary: DashboardSummary | null | undefined,
): DashboardSummaryMetrics {
  const active = summary?.active_monitors ?? 0;
  const disabled = summary?.disabled_monitors ?? 0;
  return {
    monitorTotal: active + disabled,
    monitorCategoryTotal: active + disabled + (summary?.needs_attention ?? 0),
  };
}

/**
 * Formats relative time deterministically for a supplied clock value.
 * The caller owns the clock so this function can be tested without fake timers.
 */
export function formatRelativeDate(
  value: string | null | undefined,
  nowMs: number,
  formatFallback: (value: string | null | undefined) => string = formatDateTime,
): string {
  if (!value) return 'Time unavailable';

  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'Time unavailable';

  const minutes = Math.round((time - nowMs) / 60_000);
  if (Math.abs(minutes) < 1) return 'Just now';
  if (minutes < 0) return `${Math.abs(minutes)}m ago`;
  if (minutes < 60) return `In ${minutes}m`;

  const hours = Math.round(minutes / 60);
  return minutes < 1440 ? `In ${hours}h` : formatFallback(value);
}
