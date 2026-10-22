import { ApiClientError, isAbortError, requestApi } from './api-client';
import { getSharedQueryClient } from './query-client';

export type TemplatePage<T> = {
  data: T[];
  page?: { next_cursor: string | null };
};

export class TemplateQueryError extends ApiClientError {
  constructor(status: number, code: string | null, requestId: string | null = null, kind: 'http' | 'network' | 'invalid_response' = status === 0 ? 'network' : 'http') {
    super(kind, `Template request failed with status ${status}.`, status, code, requestId);
    this.name = 'TemplateQueryError';
  }
}

export const templateQueryKeys = {
  all: ['templates'] as const,
  lists: () => [...templateQueryKeys.all, 'list'] as const,
  list: (workspaceId: string, query: string, cursor: string | null) =>
    [...templateQueryKeys.lists(), workspaceId, { query, cursor, limit: 25 }] as const,
  details: () => [...templateQueryKeys.all, 'detail'] as const,
  detail: (workspaceId: string, templateId: string) =>
    [...templateQueryKeys.details(), workspaceId, templateId] as const,
};

async function fetchTemplateResource<T>(url: string, signal: AbortSignal): Promise<T> {
  let response: Response;
  let body: unknown;
  let code: string | null;
  let requestId: string | null;
  try {
    ({ response, body, code, requestId } = await requestApi(url, { signal }));
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ApiClientError) throw new TemplateQueryError(error.status, error.code, error.requestId, error.kind);
    throw new TemplateQueryError(0, 'network_error');
  }

  if (!response.ok) {
    throw new TemplateQueryError(response.status, code, requestId);
  }
  return body as T;
}

export function templateListQueryOptions<T>(
  workspaceId: string,
  search: string,
  cursor: string | null,
) {
  const params = new URLSearchParams({ workspace_id: workspaceId, limit: '25' });
  if (search.trim()) params.set('q', search.trim());
  if (cursor) params.set('cursor', cursor);

  return {
    queryKey: templateQueryKeys.list(workspaceId, search.trim(), cursor),
    staleTime: 30_000,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchTemplateResource<TemplatePage<T>>(`/api/backend/templates?${params}`, signal),
  };
}

export function templateDetailQueryOptions<T>(workspaceId: string, templateId: string) {
  return {
    queryKey: templateQueryKeys.detail(workspaceId, templateId),
    staleTime: 30_000,
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      fetchTemplateResource<T>(
        `/api/backend/templates/${encodeURIComponent(templateId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
        signal,
      ),
  };
}

export function fetchTemplatePage<T>(workspaceId: string, search: string, cursor: string | null) {
  return getSharedQueryClient().fetchQuery(templateListQueryOptions<T>(workspaceId, search, cursor));
}

export function fetchTemplateDetail<T>(workspaceId: string, templateId: string) {
  return getSharedQueryClient().fetchQuery(templateDetailQueryOptions<T>(workspaceId, templateId));
}
