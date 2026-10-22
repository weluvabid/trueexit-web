import { getApiErrorCode } from './api-response';
import { getSharedQueryClient } from './query-client';

export type TemplatePage<T> = {
  data: T[];
  page?: { next_cursor: string | null };
};

export class TemplateQueryError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
  ) {
    super(`Template request failed with status ${status}`);
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
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new TemplateQueryError(0, 'network_error');
  }

  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new TemplateQueryError(response.status, getApiErrorCode(body));
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
