import { getSharedQueryClient, waitForQueryCacheRestoration } from './query-client';
import { getApiErrorCode } from './api-response';

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
  | { ok: false; status: number; code: string | null };

type SharedHttpResult = { ok: boolean; status: number; body: unknown; code: string | null };

const workspaceBootstrapKeys = {
  me: ['workspace-bootstrap', 'me'] as const,
  workspaces: ['workspace-bootstrap', 'workspaces', { limit: 50 }] as const,
};

async function readResource(path: string): Promise<SharedHttpResult> {
  try {
    const response = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    const code = getApiErrorCode(body);
    return { ok: response.ok, status: response.status, body, code };
  } catch {
    return { ok: false, status: 0, body: null, code: 'network_error' };
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
    queryFn: () => readResource('/api/backend/me'),
    staleTime: 30_000,
  };
  const workspacesOptions = {
    queryKey: workspaceBootstrapKeys.workspaces,
    queryFn: () => readResource('/api/backend/workspaces?limit=50'),
    staleTime: 30_000,
  };

  const cachedMe = queryClient.getQueryData<SharedHttpResult>(workspaceBootstrapKeys.me);
  const cachedWorkspaces = queryClient.getQueryData<SharedHttpResult>(workspaceBootstrapKeys.workspaces);

  // Use any restored successful response immediately. fetchQuery still performs
  // stale revalidation, but its promise must not hold up the first render.
  if (cachedMe) void queryClient.fetchQuery(meOptions).catch(() => undefined);
  if (cachedWorkspaces) void queryClient.fetchQuery(workspacesOptions).catch(() => undefined);

  const [me, workspaces] = await Promise.all([
    cachedMe ?? queryClient.fetchQuery(meOptions),
    cachedWorkspaces ?? queryClient.fetchQuery(workspacesOptions),
  ]);

  return normalizeBootstrap(me, workspaces);
}

function normalizeBootstrap(me: SharedHttpResult, workspaces: SharedHttpResult): {
  me: BootstrapResource<CurrentUserContext>;
  workspaces: BootstrapResource<WorkspacePage>;
} {
  return {
    me: me.ok ? { ok: true, data: me.body as CurrentUserContext } : { ok: false, status: me.status, code: me.code ?? null },
    workspaces: workspaces.ok ? { ok: true, data: workspaces.body as WorkspacePage } : { ok: false, status: workspaces.status, code: workspaces.code ?? null },
  };
}
