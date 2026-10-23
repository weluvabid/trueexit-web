import { ApiClientError, isAbortError, requestApi } from './api-client';
import { parseApiBody, templatePageSchema, templateSchema } from './api-schemas';
import type { Template } from './template-types';
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

async function fetchTemplateResource(url: string, signal: AbortSignal): Promise<unknown> {
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
  return body;
}

export function templateListQueryOptions(
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
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<TemplatePage<Template>> => {
      const body = await fetchTemplateResource(`/api/backend/templates?${params}`, signal);
      const page = parseApiBody(templatePageSchema, body);
      return { data: page.data, page: { next_cursor: page.page?.next_cursor ?? null } };
    },
  };
}

export function templateDetailQueryOptions(workspaceId: string, templateId: string) {
  return {
    queryKey: templateQueryKeys.detail(workspaceId, templateId),
    staleTime: 30_000,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<Template> => {
      const body = await fetchTemplateResource(
        `/api/backend/templates/${encodeURIComponent(templateId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
        signal,
      );
      return parseApiBody(templateSchema, body);
    },
  };
}

export function fetchTemplatePage(workspaceId: string, search: string, cursor: string | null) {
  return getSharedQueryClient().fetchQuery(templateListQueryOptions(workspaceId, search, cursor));
}

export function fetchTemplateDetail(workspaceId: string, templateId: string) {
  return getSharedQueryClient().fetchQuery(templateDetailQueryOptions(workspaceId, templateId));
}
