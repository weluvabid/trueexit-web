import type { QueryClient } from '@tanstack/svelte-query';
import { monitorQueryKeys, monitorResourceQueryKeys } from './monitor-queries';

export type MonitorMutationResult = {
  ok: boolean;
  status: number;
  code: string | null;
  body: unknown;
};

type CreateMonitorVariables = {
  workspaceId: string;
  requestBody: string;
  idempotencyKey: string;
};

type EditMonitorVariables = CreateMonitorVariables & {
  monitorId: string;
};

async function sendMonitorMutation(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT',
  requestBody: string,
  idempotencyKey: string,
): Promise<MonitorMutationResult> {
  const response = await fetch(url, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: requestBody,
  });
  const body: unknown = await response.json().catch(() => null);
  const error = body && typeof body === 'object' && 'error' in body
    ? (body as { error?: { code?: unknown } }).error
    : null;
  return {
    ok: response.ok,
    status: response.status,
    code: typeof error?.code === 'string' ? error.code : null,
    body,
  };
}

export function createMonitorMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (variables: CreateMonitorVariables) =>
      sendMonitorMutation('/api/backend/monitors', 'POST', variables.requestBody, variables.idempotencyKey),
    onSuccess: async (result: MonitorMutationResult, variables: CreateMonitorVariables) => {
      if (result.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: monitorQueryKeys.workspaceLists(variables.workspaceId) }),
          queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceChannels(variables.workspaceId) }),
        ]);
      }
    },
  };
}

export function editMonitorMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (variables: EditMonitorVariables) =>
      sendMonitorMutation(
        `/api/backend/monitors/${encodeURIComponent(variables.monitorId)}?workspace_id=${encodeURIComponent(variables.workspaceId)}`,
        'PATCH',
        variables.requestBody,
        variables.idempotencyKey,
      ),
    onSuccess: async (result: MonitorMutationResult, variables: EditMonitorVariables) => {
      if (result.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: monitorQueryKeys.workspaceLists(variables.workspaceId) }),
          queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorDetail(variables.workspaceId, variables.monitorId) }),
          queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorChannels(variables.workspaceId, variables.monitorId) }),
          queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceChannels(variables.workspaceId) }),
        ]);
      }
    },
  };
}

type TagMonitorVariables = CreateMonitorVariables & {
  monitorId: string;
};

type LifecycleMonitorVariables = {
  workspaceId: string;
  monitorId: string;
  action: 'pause' | 'resume' | 'archive' | 'restore';
  idempotencyKey: string;
};

export function tagMonitorMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (variables: TagMonitorVariables) =>
      sendMonitorMutation(
        `/api/backend/monitors/${encodeURIComponent(variables.monitorId)}/tags`,
        'PUT',
        variables.requestBody,
        variables.idempotencyKey,
      ),
    onSuccess: async (result: MonitorMutationResult, variables: TagMonitorVariables) => {
      if (result.ok) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: monitorQueryKeys.workspaceLists(variables.workspaceId) }),
          queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceTags(variables.workspaceId) }),
          queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorTags(variables.workspaceId, variables.monitorId) }),
        ]);
      }
    },
  };
}

export function lifecycleMonitorMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: LifecycleMonitorVariables): Promise<MonitorMutationResult> => {
      const response = await fetch(
        `/api/backend/monitors/${encodeURIComponent(variables.monitorId)}/${variables.action}?workspace_id=${encodeURIComponent(variables.workspaceId)}`,
        {
          method: 'POST',
          credentials: 'same-origin',
          cache: 'no-store',
          headers: {
            Accept: 'application/json',
            'Idempotency-Key': variables.idempotencyKey,
          },
        },
      );
      const body: unknown = await response.json().catch(() => null);
      const error = body && typeof body === 'object' && 'error' in body
        ? (body as { error?: { code?: unknown } }).error
        : null;
      return {
        ok: response.ok,
        status: response.status,
        code: typeof error?.code === 'string' ? error.code : null,
        body,
      };
    },
    onSuccess: async (result: MonitorMutationResult, variables: LifecycleMonitorVariables) => {
      if (result.ok) {
        await queryClient.invalidateQueries({
          queryKey: monitorQueryKeys.workspaceLists(variables.workspaceId),
        });
      }
    },
  };
}
