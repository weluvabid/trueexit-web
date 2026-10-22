import { getSharedQueryClient } from './query-client';
import { getApiErrorCode, getApiList } from './api-response';

export const listSettingsData = getApiList;

export function getSettingsErrorCode(body: unknown): string | null {
  return getApiErrorCode(body);
}

export function settingsErrorMessage(status: number, code: string | null): string {
  if (code === 'recent_authentication_required') return 'For security, verify your identity again, then retry this action.';
  if (code === 'channel_in_use') return 'This destination is still assigned to one or more monitors. Remove those assignments before deleting it.';
  if (code === 'channel_secret_migration_required') return 'This destination uses a legacy secret format. Its secret must be migrated before this change can be saved.';
  if (code === 'idempotency_key_reused') return 'This operation key was already used for a different request. Refresh the page before trying again.';
  if (status === 401) return 'Your session needs attention. Sign in again to continue.';
  if (status === 403) return 'You do not have permission to perform this action in this workspace.';
  if (status === 404) return 'This workspace or resource is no longer available. Refresh and try again.';
  if (status === 409) return 'The resource changed or is still in use. Refresh the current section and try again.';
  if (status === 422) return 'The request was not accepted. Check the entered values and try again.';
  if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
  if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
  return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
}

export async function requestSettingsApi(
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; body: unknown }> {
  const method = (init.method ?? 'GET').toUpperCase();
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  if (!['GET', 'HEAD'].includes(method) && !headers.has('Idempotency-Key')) {
    headers.set('Idempotency-Key', crypto.randomUUID());
  }
  const requestInit: RequestInit = { ...init, headers, credentials: 'same-origin', cache: 'no-store' };
  const client = getSharedQueryClient();

  if (method === 'GET') {
    // Cache parsed settings resources under their request path. Query identity
    // includes the workspace/resource path, while the signal remains owned by
    // TanStack Query rather than the legacy shared HTTP cache.
    const result = await client.fetchQuery({
      queryKey: ['settings-api', path],
      staleTime: 30_000,
      queryFn: async ({ signal }) => {
        const response = await fetch(`/api/backend${path}`, { ...requestInit, signal });
        const body = response.status === 204 ? null : await response.json().catch(() => null);
        return { status: response.status, body };
      },
    });
    const response = new Response(result.body === null ? null : JSON.stringify(result.body), {
      status: result.status,
      headers: { 'Content-Type': 'application/json' },
    });
    return { response, body: result.body };
  }

  const response = await fetch(`/api/backend${path}`, requestInit);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!['GET', 'HEAD'].includes(method) && response.ok) {
    // Settings resources now live under their own TanStack Query key family.
    await client.invalidateQueries({ queryKey: ['settings-api'] });
  }
  return { response, body };
}
