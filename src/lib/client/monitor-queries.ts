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

  const response = await fetch(`/api/backend/monitors?${params.toString()}`, {
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
  const response = await fetch(`/api/backend/templates?workspace_id=${encodeURIComponent(workspaceId)}&limit=100`, {
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
