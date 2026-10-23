import { getSharedQueryClient } from './query-client';
import * as v from 'valibot';
import { ApiClientError, requestApi } from './api-client';
import { parseApiBody } from './api-schemas';

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
  // The selected workspace is authoritative; callers cannot override it via
  // additional query parameters.
  const params = new URLSearchParams({ ...extra, workspace_id: workspaceId });
  return `/api/backend/${path}?${params.toString()}`;
}

/**
 * Give investigation resources a structured cache identity so mutations can
 * invalidate a monitor's entire investigation subtree without string matching
 * opaque request URLs. Non-workspace query parameters remain part of identity.
 */
function investigationResourceKey(requestPath: string) {
  const url = new URL(requestPath, 'https://trueexit.invalid');
  const path = url.pathname.replace(/^\/api\/backend\/?/, '');
  const pathSegments = path.split('/').filter(Boolean);
  const workspaceId = url.searchParams.get('workspace_id') ?? '';
  const query = [...url.searchParams.entries()]
    .filter(([key]) => key !== 'workspace_id')
    .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));

  return ['investigation-resource', workspaceId, ...pathSegments, query] as const;
}

export const investigationQueryKeys = {
  all: ['investigation-resource'] as const,
  resource: (requestPath: string) => investigationResourceKey(requestPath),
  monitor: (workspaceId: string, monitorId: string) => [
    'investigation-resource',
    workspaceId,
    'monitors',
    encodeURIComponent(monitorId),
  ] as const,
};

function investigationResourceQueryOptionsForPath<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  requestPath: string,
  schema: TSchema,
  staleTime: number,
) {
  return {
    queryKey: investigationQueryKeys.resource(requestPath),
    staleTime,
    retry: false,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<v.InferOutput<TSchema>> => {
      const { response, body, code, requestId } = await requestApi(requestPath, { signal });
      if (!response.ok) {
        throw new InvestigationQueryError(
          getInvestigationErrorMessage(response.status, code),
          response.status,
          code,
          requestId,
        );
      }
      return parseApiBody(schema, body, { status: response.status, requestId });
    },
  };
}

export async function readInvestigationResource<
  TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>,
>(
  path: string,
  schema: TSchema,
): Promise<Resource<v.InferOutput<TSchema>>> {
  try {
    const data = await getSharedQueryClient().fetchQuery(
      investigationResourceQueryOptionsForPath(path, schema, 15_000),
    );
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

export function investigationResourceQueryOptions<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  workspaceId: string,
  monitorId: string,
  path: string,
  schema: TSchema,
  extra: Record<string, string> = {},
) {
  const queryPath = buildInvestigationApiPath(workspaceId, path, extra);
  return {
    ...investigationResourceQueryOptionsForPath(queryPath, schema, 30_000),
    enabled: Boolean(workspaceId && monitorId),
  };
}
