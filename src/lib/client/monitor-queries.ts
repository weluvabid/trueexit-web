import { fetchSharedGet } from './shared-http-query';
import { getApiErrorCode, getApiList } from './api-response';
import { QueryClient } from '@tanstack/svelte-query';

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
  page: MonitorPage<TMonitor> | null;
};

/**
 * Monitor inventory server-state cache. The component owns its QueryClient so
 * cached workspace data cannot leak between independently mounted workspaces.
 * A zero staleTime preserves the existing always-refresh-on-load behavior;
 * TanStack Query still deduplicates concurrent requests and handles aborts.
 */
export function createMonitorQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 0,
        gcTime: 60_000,
        refetchOnWindowFocus: false,
      },
    },
  });
}

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

  const response = await fetchSharedGet(`/api/backend/monitors?${params.toString()}`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  const error = body && typeof body === 'object' && 'error' in body
    ? (body as { error?: { code?: unknown } }).error
    : null;
  const code = typeof error?.code === 'string' ? error.code : null;

  if (!response.ok) {
    return { ok: false, status: response.status, code, page: null };
  }

  const result = body as MonitorPage<TMonitor> | null;
  return {
    ok: true,
    status: response.status,
    code: null,
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
  data: MonitorTemplate[];
};

export const monitorTemplateQueryKeys = {
  workspaceList: (workspaceId: string) => ['monitor-templates', 'list', workspaceId] as const,
};

export async function fetchMonitorTemplates(
  workspaceId: string,
  signal: AbortSignal,
): Promise<MonitorTemplatesResponse> {
  const response = await fetchSharedGet(`/api/backend/templates?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`, {
    headers: { Accept: 'application/json' },
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  const error = body && typeof body === 'object' && 'error' in body
    ? (body as { error?: { code?: unknown } }).error
    : null;
  const code = typeof error?.code === 'string' ? error.code : null;

  if (!response.ok) return { ok: false, status: response.status, code, data: [] };

  const rows = Array.isArray(body)
    ? body
    : body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)
      ? body.data
      : [];
  return {
    ok: true,
    status: response.status,
    code: null,
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
  data: T;
};

async function fetchApiResource<T>(url: string, signal: AbortSignal, parse: (body: unknown) => T): Promise<ApiResource<T>> {
  try {
    const response = await fetchSharedGet(url, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
      signal,
    });
    const body: unknown = await response.json().catch(() => null);
    return {
      ok: response.ok,
      status: response.status,
      code: getApiErrorCode(body),
      data: response.ok ? parse(body) : parse(null),
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return { ok: false, status: 0, code: 'network_error', data: parse(null) };
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
