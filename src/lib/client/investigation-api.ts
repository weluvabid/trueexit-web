import { getSharedQueryClient } from './query-client';
import { ApiClientError, requestApi } from './api-client';

export type Resource<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null; requestId: string | null };

export function getInvestigationErrorMessage(status: number, code: string | null): string {
  if (status === 401) return 'Your session needs attention. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to inspect this resource in the selected workspace.';
  if (status === 404) return 'This monitor or workspace is no longer available.';
  if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
  if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
  return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
}

export function buildInvestigationApiPath(workspaceId: string, path: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ workspace_id: workspaceId, ...extra });
  return `/api/backend/${path}?${params.toString()}`;
}

export async function readInvestigationResource<T>(path: string): Promise<Resource<T>> {
  try {
    const data = await getSharedQueryClient().fetchQuery({
      queryKey: ['investigation-resource', path] as const,
      staleTime: 15_000,
      retry: false,
      queryFn: async ({ signal }): Promise<T> => {
        const { response, body, code, requestId } = await requestApi(path, { signal });
        if (!response.ok) {
          throw new InvestigationQueryError(
            getInvestigationErrorMessage(response.status, code),
            response.status,
            code,
            requestId,
          );
        }
        return body as T;
      },
    });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof InvestigationQueryError) {
      return { ok: false, status: error.status, code: error.code, requestId: error.requestId };
    }
    if (error instanceof ApiClientError) {
      return { ok: false, status: error.status, code: error.code, requestId: error.requestId };
    }
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return { ok: false, status: 0, code: 'network_error', requestId: null };
  }
}


export class InvestigationQueryError extends ApiClientError {
  constructor(message: string, status: number, code: string | null, requestId: string | null = null) {
    super(status === 0 ? 'network' : 'http', message, status, code, requestId);
    this.name = 'InvestigationQueryError';
  }
}

export function investigationQueryErrorMessage(error: unknown): string {
  if (error instanceof InvestigationQueryError) return error.message;
  if (error instanceof ApiClientError) return getInvestigationErrorMessage(error.status, error.code);
  return getInvestigationErrorMessage(0, 'network_error');
}

export function investigationResourceQueryOptions<T>(
  workspaceId: string,
  monitorId: string,
  resource: string,
  path: string,
  extra: Record<string, string> = {},
) {
  const queryPath = buildInvestigationApiPath(workspaceId, path, extra);
  return {
    queryKey: ['investigation', workspaceId, monitorId, resource, extra] as const,
    enabled: Boolean(workspaceId && monitorId),
    staleTime: 30_000,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<T> => {
      const { response, body, code, requestId } = await requestApi(queryPath, { signal });
      if (!response.ok) {
        throw new InvestigationQueryError(
          getInvestigationErrorMessage(response.status, code),
          response.status,
          code,
          requestId,
        );
      }
      return body as T;
    },
  };
}
