import { ApiClientError, requestApi } from './api-client';
import { dashboardResponseSchema, parseApiBody } from './api-schemas';

import type { DashboardResponseContract } from './api-schemas';

export type DashboardSummary = DashboardResponseContract['summary'];
export type AttentionItem = DashboardResponseContract['attention_items'][number];
export type ActivityItem = DashboardResponseContract['recent_evidence_activity'][number];
export type DashboardResponse = DashboardResponseContract;

export const dashboardQueryKeys = {
  overview: (workspaceId: string) => ['dashboard', 'overview', workspaceId] as const,
  pages: (workspaceId: string, resource: 'monitors' | 'evidence') => ['dashboard-page', workspaceId, resource] as const,
  page: (workspaceId: string, resource: 'monitors' | 'evidence', queryIdentity: string) =>
    ['dashboard-page', workspaceId, resource, queryIdentity] as const,
};

export class DashboardQueryError extends ApiClientError {
  constructor(message: string, status: number, code: string | null, requestId: string | null = null) {
    super('http', message, status, code, requestId);
    this.name = 'DashboardQueryError';
  }
}

export function dashboardQueryOptions(workspaceId: string) {
  return {
    queryKey: dashboardQueryKeys.overview(workspaceId),
    enabled: Boolean(workspaceId),
    staleTime: 30_000,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<DashboardResponse> => {
      const { response, body, code, requestId } = await requestApi(
        `/api/backend/workspaces/${encodeURIComponent(workspaceId)}/dashboard`,
        { signal },
      );
      if (!response.ok) {
        const status = response.status;
        throw new DashboardQueryError(dashboardErrorMessage(status, code), status, code, requestId);
      }
      return parseApiBody(dashboardResponseSchema, body, { status: response.status, requestId });
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
  if (error instanceof ApiClientError) return dashboardErrorMessage(error.status, error.code);
  return dashboardErrorMessage(0, 'network_error');
}
