import { getApiErrorCode } from './api-response';

export type DashboardSummary = {
  active_monitors: number;
  disabled_monitors: number;
  evidence_received_recently: number;
  needs_attention: number;
  awaiting_first_evidence: number;
  evidence_outcomes_24h: { accepted: number; rejected: number; total: number };
  attention_conditions: { submission_rejected: number; evidence_overdue: number; health_signal: number };
};

export type AttentionItem = {
  monitor_id: string;
  monitor_name: string;
  reason: string;
  severity: string;
  occurred_at: string | null;
  last_valid_evidence_at: string | null;
  action: { kind: string };
};

export type ActivityItem = {
  event_id: string;
  monitor_id: string;
  monitor_name: string;
  event_type: string;
  occurred_at: string;
};

export type DashboardResponse = {
  generated_at: string;
  summary: DashboardSummary;
  attention_items: AttentionItem[];
  recent_evidence_activity: ActivityItem[];
};

export class DashboardQueryError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
  ) {
    super(message);
    this.name = 'DashboardQueryError';
  }
}

export function dashboardQueryOptions(workspaceId: string) {
  return {
    queryKey: ['dashboard', 'overview', workspaceId] as const,
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<DashboardResponse> => {
      const response = await fetch(
        `/api/backend/workspaces/${encodeURIComponent(workspaceId)}/dashboard`,
        {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
          cache: 'no-store',
          signal,
        },
      );
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const status = response.status;
        const code = getApiErrorCode(body);
        throw new DashboardQueryError(dashboardErrorMessage(status, code), status, code);
      }
      return body as DashboardResponse;
    },
  };
}

export function dashboardErrorMessage(status: number, code: string | null): string {
  if (status === 401) return 'Your session needs attention. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to view this workspace.';
  if (status === 404) return 'This workspace is no longer available.';
  if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
  if (status >= 500) return 'TrueExit could not load this information right now. Try again shortly.';
  return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
}

export function dashboardQueryErrorMessage(error: unknown): string {
  if (error instanceof DashboardQueryError) return error.message;
  return dashboardErrorMessage(0, 'network_error');
}
