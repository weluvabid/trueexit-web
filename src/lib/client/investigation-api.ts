import { fetchSharedGet } from './shared-http-query';

export type ApiFailure = { error?: { code?: string }; request_id?: string };
export type Resource<T> = { ok: true; data: T } | { ok: false; status: number; code: string | null };

export function getInvestigationErrorMessage(status: number, code: string | null): string {
  if (status === 401) return 'Your session needs attention. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to inspect this resource in the selected workspace.';
  if (status === 404) return 'This monitor or workspace is no longer available.';
  if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
  if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
  return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
}

export function buildInvestigationApiPath(workspaceId: string, path: string, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams({ workspace_id: workspaceId, ...extra });
  return `/api/backend/${path}?${params.toString()}`;
}

export async function readInvestigationResource<T>(path: string): Promise<Resource<T>> {
  try {
    const response = await fetchSharedGet(path, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      cache: 'no-store',
    });
    const body: unknown = await response.json().catch(() => null);
    if (!response.ok) {
      const error = body as ApiFailure | null;
      return { ok: false, status: response.status, code: error?.error?.code ?? null };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, code: 'network_error' };
  }
}
