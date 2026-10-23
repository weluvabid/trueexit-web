import { getSharedQueryClient } from './query-client';
import { getApiErrorCode } from './api-response';
import { parseApiList } from './api-schemas';
import type * as v from 'valibot';
import { ApiClientError, requestApi } from './api-client';
import { monitorResourceQueryKeys } from './monitor-queries';
import { workspaceBootstrapKeys } from './workspace-bootstrap';

export function listSettingsData<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  body: unknown,
): v.InferOutput<TSchema>[] {
  return parseApiList(schema, body);
}

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

type CachedSettingsResponse = { status: number; body: unknown; code?: string | null; requestId?: string | null };

class SettingsQueryError extends ApiClientError {
  constructor(readonly result: CachedSettingsResponse) {
    super(
      'http',
      `Settings request failed with status ${result.status}.`,
      result.status,
      result.code ?? getApiErrorCode(result.body),
      result.requestId ?? null,
    );
    this.name = 'SettingsQueryError';
  }
}

function responseFromResult(result: CachedSettingsResponse): Response {
  return new Response(result.body === null ? null : JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const settingsQueryKeys = {
  all: ['settings-api'] as const,
  read: (path: string) => ['settings-api', path] as const,
  accounts: () => ['settings-api', '/accounts'] as const,
};

/** Read a cached settings response without waiting for stale-data revalidation. */
export function getCachedSettingsResponse(path: string): { response: Response; body: unknown } | null {
  const cached = getSharedQueryClient().getQueryData<CachedSettingsResponse>(settingsQueryKeys.read(path));
  if (!cached) return null;
  return { response: responseFromResult(cached), body: cached.body };
}

type SettingsMutationEffect =
  | { kind: 'members'; workspaceId: string }
  | { kind: 'invitations'; workspaceId: string }
  | { kind: 'channels'; workspaceId: string }
  | { kind: 'workspace-bootstrap' }
  | { kind: 'none' };

/** Match endpoint families without decoding/re-encoding path segments. */
function settingsMutationEffect(path: string): SettingsMutationEffect {
  const pathname = path.split('?', 1)[0];
  const members = pathname.match(/^\/workspaces\/([^/]+)\/members(?:\/|$)/);
  if (members) return { kind: 'members', workspaceId: members[1] };

  const invitations = pathname.match(/^\/workspaces\/([^/]+)\/invitations(?:\/|$)/);
  if (invitations) return { kind: 'invitations', workspaceId: invitations[1] };

  const channels = pathname.match(/^\/workspaces\/([^/]+)\/channels(?:\/(.*))?$/);
  if (channels && !channels[2]?.startsWith('validate')) {
    return { kind: 'channels', workspaceId: channels[1] };
  }

  if (/^\/workspaces(?:\/[^/]+)?$/.test(pathname) || /^\/accounts(?:\/|$)/.test(pathname)) {
    return { kind: 'workspace-bootstrap' };
  }
  return { kind: 'none' };
}

async function invalidateSettingsAfterMutation(path: string): Promise<void> {
  const client = getSharedQueryClient();
  const effect = settingsMutationEffect(path);
  const invalidations: Promise<unknown>[] = [];

  switch (effect.kind) {
    case 'members':
      invalidations.push(client.invalidateQueries({
        queryKey: settingsQueryKeys.read(`/workspaces/${effect.workspaceId}/members`),
      }));
      break;
    case 'invitations':
      invalidations.push(client.invalidateQueries({
        queryKey: settingsQueryKeys.read(`/workspaces/${effect.workspaceId}/invitations`),
      }));
      break;
    case 'channels':
      invalidations.push(
        client.invalidateQueries({ queryKey: settingsQueryKeys.read(`/workspaces/${effect.workspaceId}/channels`) }),
        // Destination edits also affect the monitor editor's cached channel inventory.
        client.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceChannels(effect.workspaceId) }),
      );
      break;
    case 'workspace-bootstrap':
      invalidations.push(
        client.invalidateQueries({ queryKey: settingsQueryKeys.accounts() }),
        client.invalidateQueries({ queryKey: workspaceBootstrapKeys.all }),
      );
      break;
    case 'none':
      break;
  }

  await Promise.all(invalidations);
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
  const requestInit: RequestInit = { ...init, headers };
  const client = getSharedQueryClient();

  if (method === 'GET') {
    try {
      const result = await client.query({
        queryKey: settingsQueryKeys.read(path),
        staleTime: 30_000,
        queryFn: async ({ signal }): Promise<CachedSettingsResponse> => {
          const { response, body, code, requestId } = await requestApi(`/api/backend${path}`, { ...requestInit, signal });
          const result = { status: response.status, body, code, requestId };
          // HTTP failures must remain failed queries; otherwise TanStack caches
          // an authorization or server error as a successful read.
          if (!response.ok) throw new SettingsQueryError(result);
          return result;
        },
      });
      return { response: responseFromResult(result), body: result.body };
    } catch (error) {
      if (error instanceof SettingsQueryError) {
        return { response: responseFromResult(error.result), body: error.result.body };
      }
      throw error;
    }
  }

  const { response, body } = await requestApi(`/api/backend${path}`, requestInit);
  if (!['GET', 'HEAD'].includes(method) && response.ok) {
    await invalidateSettingsAfterMutation(path);
  }
  return { response, body };
}
