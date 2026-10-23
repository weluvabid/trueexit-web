import { getSharedQueryClient, waitForQueryCacheRestoration } from './query-client';
import type { Query } from '@tanstack/query-core';
import { ApiClientError, isAbortError, requestApi } from './api-client';
import { currentUserContextSchema, parseApiBody, workspacePageSchema } from './api-schemas';

import type { CurrentUserContextContract, WorkspaceContextContract, WorkspacePageContract } from './api-schemas';

export type CurrentUserContext = CurrentUserContextContract;
export type WorkspaceContext = WorkspaceContextContract;
export type WorkspacePage = WorkspacePageContract;

export type BootstrapResource<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; code: string | null; requestId: string | null };

type SharedHttpResult =
  | { ok: true; status: number; body: unknown; code: string | null; requestId: string | null }
  | { ok: false; status: number; body: null; code: string | null; requestId: string | null };

export const workspaceBootstrapKeys = {
  all: ['workspace-bootstrap'] as const,
  me: ['workspace-bootstrap', 'me'] as const,
  workspaces: ['workspace-bootstrap', 'workspaces', { limit: 50 }] as const,
};

async function readResource(path: string, signal: AbortSignal): Promise<SharedHttpResult> {
  try {
    const { response, body, code, requestId } = await requestApi(path, { signal });
    if (!response.ok) {
      return { ok: false, status: response.status, body: null, code, requestId };
    }
    return { ok: true, status: response.status, body, code, requestId };
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
    staleTime: (query: Query<SharedHttpResult>) =>
      query.state.data?.ok ? 30_000 : 0,
  };
  const workspacesOptions = {
    queryKey: workspaceBootstrapKeys.workspaces,
    queryFn: ({ signal }: { signal: AbortSignal }) => readResource('/api/backend/workspaces?limit=50', signal),
    staleTime: (query: Query<SharedHttpResult>) =>
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

function normalizeBootstrapResource<T>(
  result: SharedHttpResult,
  parse: (body: unknown, status: number, requestId: string | null) => T,
): BootstrapResource<T> {
  if (!result.ok) {
    return { ok: false, status: result.status, code: result.code, requestId: result.requestId };
  }

  try {
    return { ok: true, data: parse(result.body, result.status, result.requestId) };
  } catch (error) {
    if (error instanceof ApiClientError && error.kind === 'invalid_response') {
      return { ok: false, status: result.status, code: error.code, requestId: result.requestId };
    }
    throw error;
  }
}

function normalizeBootstrap(me: SharedHttpResult, workspaces: SharedHttpResult): {
  me: BootstrapResource<CurrentUserContext>;
  workspaces: BootstrapResource<WorkspacePage>;
} {
  return {
    me: normalizeBootstrapResource(me, (body, status, requestId) => parseApiBody(currentUserContextSchema, body, { status, requestId })),
    workspaces: normalizeBootstrapResource(workspaces, (body, status, requestId) => parseApiBody(workspacePageSchema, body, { status, requestId })),
  };
}
