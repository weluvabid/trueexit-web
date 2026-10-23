import { getSharedQueryClient, waitForQueryCacheRestoration } from './query-client';
import { ApiClientError, isAbortError, requestApi } from './api-client';

export interface CurrentUserContext {
  user_id: string;
  owned_account_ids: string[];
  personal_workspace_id: string | null;
}

export interface WorkspaceContext {
  id: string;
  account_id: string;
  name: string;
  personal: boolean;
  account_owner: boolean;
  role: 'admin' | 'member' | null;
}

export interface WorkspacePage {
  data: WorkspaceContext[];
  page: { next_cursor: string | null };
}

export type BootstrapResource<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null; requestId: string | null };

type SharedHttpResult = { ok: boolean; status: number; body: unknown; code: string | null; requestId: string | null };

export const workspaceBootstrapKeys = {
  all: ['workspace-bootstrap'] as const,
  me: ['workspace-bootstrap', 'me'] as const,
  workspaces: ['workspace-bootstrap', 'workspaces', { limit: 50 }] as const,
};

async function readResource(path: string, signal: AbortSignal): Promise<SharedHttpResult> {
  try {
    const { response, body, code, requestId } = await requestApi(path, { signal });
    return { ok: response.ok, status: response.status, body, code, requestId };
  } catch (error) {
    if (isAbortError(error)) throw error;
    if (error instanceof ApiClientError) {
      return { ok: false, status: error.status, body: null, code: error.code, requestId: error.requestId };
    }
    return { ok: false, status: 0, body: null, code: 'network_error', requestId: null };
  }
}

/**
 * Bootstrap resources share the application QueryClient, so concurrent shell
 * and page consumers deduplicate through query identity rather than a separate
 * document-level promise. The server still receives a fresh client per render.
 */
export async function loadWorkspaceBootstrap(): Promise<{
  me: BootstrapResource<CurrentUserContext>;
  workspaces: BootstrapResource<WorkspacePage>;
}> {
  // Hydrate persisted data before deciding whether bootstrap must block the UI.
  await waitForQueryCacheRestoration();

  const queryClient = getSharedQueryClient();
  const meOptions = {
    queryKey: workspaceBootstrapKeys.me,
    queryFn: ({ signal }: { signal: AbortSignal }) => readResource('/api/backend/me', signal),
    // Failures are intentionally represented as data so the shell can render
    // partial bootstrap state. Do not cache that failure as fresh for 30 seconds.
    staleTime: (query) =>
      query.state.data?.ok ? 30_000 : 0,
  };
  const workspacesOptions = {
    queryKey: workspaceBootstrapKeys.workspaces,
    queryFn: ({ signal }: { signal: AbortSignal }) => readResource('/api/backend/workspaces?limit=50', signal),
    staleTime: (query) =>
      query.state.data?.ok ? 30_000 : 0,
  };

  const cachedMe = queryClient.getQueryData<SharedHttpResult>(workspaceBootstrapKeys.me);
  const cachedWorkspaces = queryClient.getQueryData<SharedHttpResult>(workspaceBootstrapKeys.workspaces);
  const usableCachedMe = cachedMe?.ok ? cachedMe : undefined;
  const usableCachedWorkspaces = cachedWorkspaces?.ok ? cachedWorkspaces : undefined;

  // Use restored successful responses immediately. Stale revalidation must not
  // hold up first render, while cached failures are retried on the next bootstrap.
  if (usableCachedMe) void queryClient.fetchQuery(meOptions).catch(() => undefined);
  if (usableCachedWorkspaces) void queryClient.fetchQuery(workspacesOptions).catch(() => undefined);

  const [me, workspaces] = await Promise.all([
    usableCachedMe ?? queryClient.fetchQuery(meOptions),
    usableCachedWorkspaces ?? queryClient.fetchQuery(workspacesOptions),
  ]);

  return normalizeBootstrap(me, workspaces);
}

function normalizeBootstrap(me: SharedHttpResult, workspaces: SharedHttpResult): {
  me: BootstrapResource<CurrentUserContext>;
  workspaces: BootstrapResource<WorkspacePage>;
} {
  return {
    me: me.ok ? { ok: true, data: me.body as CurrentUserContext } : { ok: false, status: me.status, code: me.code ?? null, requestId: me.requestId },
    workspaces: workspaces.ok ? { ok: true, data: workspaces.body as WorkspacePage } : { ok: false, status: workspaces.status, code: workspaces.code ?? null, requestId: workspaces.requestId },
  };
}
