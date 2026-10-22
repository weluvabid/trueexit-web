import { fetchSharedGet } from './shared-http-query';

export type SettingsApiError = { error?: { code?: string; details?: unknown }; request_id?: string };

export function listSettingsData<T>(body: unknown): T[] {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) return body.data as T[];
  return [];
}

export function getSettingsErrorCode(body: unknown): string | null {
  if (!body || typeof body !== 'object' || !('error' in body)) return null;
  const detail = (body as SettingsApiError).error;
  return typeof detail?.code === 'string' ? detail.code : null;
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
  const response = method === 'GET'
    ? await fetchSharedGet(`/api/backend${path}`, requestInit)
    : await fetch(`/api/backend${path}`, requestInit);
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  return { response, body };
}
