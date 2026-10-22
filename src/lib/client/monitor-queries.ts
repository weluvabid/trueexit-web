import { getApiList } from './api-response';
import { ApiClientError, isAbortError, requestApi } from './api-client';

export class MonitorQueryError extends ApiClientError {
  constructor(status: number, code: string | null, requestId: string | null = null) {
    super(status === 0 ? 'network' : 'http', code ?? 'monitor_query_failed', status, code, requestId);
    this.name = 'MonitorQueryError';
  }
}

export function requireMonitorQueryResult<T extends { ok: boolean; status: number; code: string | null; requestId?: string | null }>(result: T): T {
  if (!result.ok) throw new MonitorQueryError(result.status, result.code, result.requestId ?? null);
  return result;
}

export function monitorQueryErrorMessage(error: unknown, fallback: (status: number, code: string | null) => string): string {
  return error instanceof ApiClientError
    ? fallback(error.status, error.code)
    : fallback(0, 'network_error');
}

export type MonitorListQuery = {
  workspaceId: string;
  limit: number;
  sort: string;
  direction: 'asc' | 'desc';
  search: string;
  status: 'all' | 'enabled' | 'disabled' | 'archived';
  tagId: string;
  includeArchived: boolean;
  cursor: string | null;
};

export type MonitorPage<TMonitor> = {
  data: TMonitor[];
  page: { next_cursor: string | null };
};

export type MonitorListResponse<TMonitor> = {
  ok: boolean;
  status: number;
  code: string | null;
  requestId: string | null;
  page: MonitorPage<TMonitor> | null;
};

export const monitorQueryKeys = {
  workspaceLists: (workspaceId: string) => ['monitors', 'list', workspaceId] as const,
  list: (query: MonitorListQuery) => ['monitors', 'list', query.workspaceId, {
    limit: query.limit,
    sort: query.sort,
    direction: query.direction,
    search: query.search,
    status: query.status,
    tagId: query.tagId,
    includeArchived: query.includeArchived,
    cursor: query.cursor,
  }] as const,
};

export function monitorListQueryOptions<TMonitor>(query: MonitorListQuery) {
  return {
    queryKey: monitorQueryKeys.list(query),
    queryFn: async ({ signal }: { signal: AbortSignal }) =>
      requireMonitorQueryResult(await fetchMonitorPage<TMonitor>(query, signal)),
    staleTime: 0,
    retry: false as const,
  };
}

export async function fetchMonitorPage<TMonitor>(
  query: MonitorListQuery,
  signal: AbortSignal,
): Promise<MonitorListResponse<TMonitor>> {
  const params = new URLSearchParams({
    workspace_id: query.workspaceId,
    limit: String(query.limit),
    sort: query.sort,
    direction: query.direction,
  });
  if (query.search) params.set('q', query.search);
  if (query.status !== 'all') params.set('status', query.status);
  if (query.tagId) params.set('tag_ids', query.tagId);
  if (query.includeArchived || query.status === 'archived') params.set('include_archived', 'true');
  if (query.cursor) params.set('cursor', query.cursor);

  const { response, body, code, requestId } = await requestApi(`/api/backend/monitors?${params.toString()}`, { signal });

  if (!response.ok) {
    return { ok: false, status: response.status, code, requestId, page: null };
  }

  const result = body as MonitorPage<TMonitor> | null;
  return {
    ok: true,
    status: response.status,
    code: null,
    requestId: null,
    page: {
      data: Array.isArray(result?.data) ? result.data : [],
      page: { next_cursor: result?.page?.next_cursor ?? null },
    },
  };
}

export type MonitorTemplate = {
  id: string;
  name: string;
  description?: string;
  fields: Array<{ name: string; path: string; primitive: number }>;
};

export type MonitorTemplatesResponse = {
  ok: boolean;
  status: number;
  code: string | null;
  requestId: string | null;
  data: MonitorTemplate[];
};

export const monitorTemplateQueryKeys = {
  workspaceList: (workspaceId: string) => ['monitor-templates', 'list', workspaceId] as const,
};

export async function fetchMonitorTemplates(
  workspaceId: string,
  signal: AbortSignal,
): Promise<MonitorTemplatesResponse> {
  const { response, body, code, requestId } = await requestApi(
    `/api/backend/templates?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`,
    { signal },
  );

  if (!response.ok) return { ok: false, status: response.status, code, requestId, data: [] };

  const rows = getApiList<unknown>(body);
  return {
    ok: true,
    status: response.status,
    code: null,
    requestId: null,
    data: rows.map((template: any) => ({
      id: String(template.id),
      name: String(template.name),
      description: typeof template.description === 'string' ? template.description : undefined,
      fields: Array.isArray(template.fields) ? template.fields : [],
    })),
  };
}

export type WorkspaceTag = {
  id: string;
  workspace_id: string;
  name: string;
  monitor_count: number;
  created_at: string;
  updated_at: string;
};

export type MonitorChannel = {
  id: string;
  label: string;
  type: 'email' | 'webhook' | 'slack' | 'discord';
  enabled: boolean;
  configured: boolean;
};

export type ApiResource<T> = {
  ok: boolean;
  status: number;
  code: string | null;
  requestId: string | null;
  data: T;
};

async function fetchApiResource<T>(url: string, signal: AbortSignal, parse: (body: unknown) => T): Promise<ApiResource<T>> {
  try {
    const { response, body, code, requestId } = await requestApi(url, { signal });
    return {
      ok: response.ok,
      status: response.status,
      code,
      requestId,
      data: response.ok ? parse(body) : parse(null),
    };
  } catch (error) {
    if (isAbortError(error)) throw error;
    return { ok: false, status: error instanceof ApiClientError ? error.status : 0, code: error instanceof ApiClientError ? error.code : 'network_error', requestId: error instanceof ApiClientError ? error.requestId : null, data: parse(null) };
  }
}


export const monitorResourceQueryKeys = {
  workspaceTags: (workspaceId: string) => ['monitor-workspace', workspaceId, 'tags'] as const,
  monitorTags: (workspaceId: string, monitorId: string) => ['monitor-workspace', workspaceId, 'monitor-tags', monitorId] as const,
  workspaceChannels: (workspaceId: string) => ['monitor-workspace', workspaceId, 'channels'] as const,
  monitorDetail: (workspaceId: string, monitorId: string) => ['monitor-workspace', workspaceId, 'detail', monitorId] as const,
  monitorChannels: (workspaceId: string, monitorId: string) => ['monitor-workspace', workspaceId, 'monitor-channels', monitorId] as const,
};

export function fetchWorkspaceTags(workspaceId: string, signal: AbortSignal): Promise<ApiResource<WorkspaceTag[] | null>> {
  return fetchApiResource(`/api/backend/workspaces/${encodeURIComponent(workspaceId)}/tags`, signal, (body) => {
    if (Array.isArray(body)) return body as WorkspaceTag[];
    if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) return body.data as WorkspaceTag[];
    return null;
  });
}

export function fetchMonitorTags(workspaceId: string, monitorId: string, signal: AbortSignal): Promise<ApiResource<WorkspaceTag[]>> {
  return fetchApiResource(`/api/backend/monitors/${encodeURIComponent(monitorId)}/tags?workspace_id=${encodeURIComponent(workspaceId)}`, signal, (body) => getApiList<WorkspaceTag>(body));
}

export function fetchWorkspaceChannels(workspaceId: string, signal: AbortSignal): Promise<ApiResource<MonitorChannel[]>> {
  return fetchApiResource(`/api/backend/workspaces/${encodeURIComponent(workspaceId)}/channels`, signal, (body) => Array.isArray(body) ? body as MonitorChannel[] : []);
}

export function fetchMonitorDetail<TMonitor>(workspaceId: string, monitorId: string, signal: AbortSignal): Promise<ApiResource<TMonitor | null>> {
  return fetchApiResource(`/api/backend/monitors/${encodeURIComponent(monitorId)}?workspace_id=${encodeURIComponent(workspaceId)}`, signal, (body) => body && typeof body === 'object' ? body as TMonitor : null);
}

export function fetchMonitorChannelIds(workspaceId: string, monitorId: string, signal: AbortSignal): Promise<ApiResource<string[]>> {
  return fetchApiResource(`/api/backend/monitors/${encodeURIComponent(monitorId)}/channels?workspace_id=${encodeURIComponent(workspaceId)}`, signal, (body) => {
    if (!body || typeof body !== 'object' || !('channel_ids' in body)) return [];
    const ids = (body as { channel_ids?: unknown }).channel_ids;
    return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [];
  });
}
