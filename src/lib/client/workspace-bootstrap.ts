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

async function readResource<T>(path: string): Promise<BootstrapResource<T>> {
  try {
    const response = await fetch(path, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });

    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const code =
        typeof body === 'object' && body !== null && 'error' in body &&
        typeof body.error === 'object' && body.error !== null && 'code' in body.error &&
        typeof body.error.code === 'string'
          ? body.error.code
          : null;
      return { ok: false, status: response.status, code };
    }

    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, code: 'network_error' };
  }
}

/**
 * The single client-side owner for initial identity/workspace loading.
 * The two existing API contracts remain independent and are requested in parallel;
 * a failure in one does not discard the result of the other.
 */
export async function loadWorkspaceBootstrap(): Promise<{
  me: BootstrapResource<CurrentUserContext>;
  workspaces: BootstrapResource<WorkspacePage>;
}> {
  const [me, workspaces] = await Promise.all([
    readResource<CurrentUserContext>('/api/backend/me'),
    readResource<WorkspacePage>('/api/backend/workspaces?limit=50'),
  ]);

  return { me, workspaces };
}
