import { fetchSharedGet } from './shared-http-query';

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
type SharedBootstrapResult = { me: SharedHttpResult; workspaces: SharedHttpResult };

declare global {
  interface Window {
    /** Shared by the app shell and hydrated page component for this document lifetime. */
    __trueExitWorkspaceBootstrapPromise?: Promise<SharedBootstrapResult>;
  }
}

async function readResource(path: string): Promise<SharedHttpResult> {
  try {
    const response = await fetchSharedGet(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    const code = typeof body === 'object' && body !== null && 'error' in body &&
      typeof body.error === 'object' && body.error !== null && 'code' in body.error &&
      typeof body.error.code === 'string' ? body.error.code : null;
    return { ok: response.ok, status: response.status, body, code };
  } catch {
    return { ok: false, status: 0, body: null, code: 'network_error' };
  }
}

/**
 * One in-flight bootstrap request pair per document. The app shell and the
 * hydrated page workspace consume the same promise instead of independently
 * requesting identity and workspace inventory.
 */
export function loadWorkspaceBootstrap(): Promise<{
  me: BootstrapResource<CurrentUserContext>;
  workspaces: BootstrapResource<WorkspacePage>;
}> {
  if (typeof window === 'undefined') {
    return Promise.all([
      readResource('/api/backend/me'),
      readResource('/api/backend/workspaces?limit=50'),
    ]).then(([me, workspaces]) => normalizeBootstrap(me, workspaces));
  }

  const shared = window.__trueExitWorkspaceBootstrapPromise ??= Promise.all([
    readResource('/api/backend/me'),
    readResource('/api/backend/workspaces?limit=50'),
  ]).then(([me, workspaces]) => ({ me, workspaces }));

  return shared.then(({ me, workspaces }) => normalizeBootstrap(me, workspaces));
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
