import { assertApiSuccess, requestApi } from './api-client';
import type { QueryClient } from '@tanstack/svelte-query';
import { monitorQueryKeys, monitorResourceQueryKeys } from './monitor-queries';
import { dashboardQueryKeys } from './dashboard-queries';

export type MonitorMutationResult = {
  status: number;
  code: string | null;
  requestId: string | null;
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


async function invalidateMonitorInventory(queryClient: QueryClient, workspaceId: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: monitorQueryKeys.workspaceLists(workspaceId) }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.pages(workspaceId, 'monitors') }),
    queryClient.invalidateQueries({ queryKey: dashboardQueryKeys.overview(workspaceId) }),
  ]);
}

async function sendMonitorMutation(
  url: string,
  method: 'POST' | 'PATCH' | 'PUT',
  requestBody: string,
  idempotencyKey: string,
): Promise<MonitorMutationResult> {
  const result = await requestApi(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: requestBody,
  });
  assertApiSuccess(result);
  return { status: result.response.status, code: result.code, requestId: result.requestId, body: result.body };
}

export function createMonitorMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: (variables: CreateMonitorVariables) =>
      sendMonitorMutation('/api/backend/monitors', 'POST', variables.requestBody, variables.idempotencyKey),
    onSuccess: async (_result: MonitorMutationResult, variables: CreateMonitorVariables) => {
      await invalidateMonitorInventory(queryClient, variables.workspaceId);
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
    onSuccess: async (_result: MonitorMutationResult, variables: EditMonitorVariables) => {
      await Promise.all([
        invalidateMonitorInventory(queryClient, variables.workspaceId),
        queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorDetail(variables.workspaceId, variables.monitorId) }),
        queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorChannels(variables.workspaceId, variables.monitorId) }),
        queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceChannels(variables.workspaceId) }),
      ]);
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
    onSuccess: async (_result: MonitorMutationResult, variables: TagMonitorVariables) => {
      await Promise.all([
        invalidateMonitorInventory(queryClient, variables.workspaceId),
        queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.workspaceTags(variables.workspaceId) }),
        queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorTags(variables.workspaceId, variables.monitorId) }),
      ]);
    },
  };
}

export function lifecycleMonitorMutationOptions(queryClient: QueryClient) {
  return {
    mutationFn: async (variables: LifecycleMonitorVariables): Promise<MonitorMutationResult> => {
      const result = await requestApi(
        `/api/backend/monitors/${encodeURIComponent(variables.monitorId)}/${variables.action}?workspace_id=${encodeURIComponent(variables.workspaceId)}`,
        {
          method: 'POST',
          headers: { 'Idempotency-Key': variables.idempotencyKey },
        },
      );
      assertApiSuccess(result);
      return { status: result.response.status, code: result.code, requestId: result.requestId, body: result.body };
    },
    onSuccess: async (_result: MonitorMutationResult, variables: LifecycleMonitorVariables) => {
      await Promise.all([
        invalidateMonitorInventory(queryClient, variables.workspaceId),
        queryClient.invalidateQueries({ queryKey: monitorResourceQueryKeys.monitorDetail(variables.workspaceId, variables.monitorId) }),
      ]);
    },
  };
}
