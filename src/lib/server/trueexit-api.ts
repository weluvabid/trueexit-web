export interface TrueExitWorkspace {
  id: string;
  account_id: string;
  name: string;
  personal: boolean;
  account_owner: boolean;
  role: 'admin' | 'member' | null;
}

export type MonitorStatus = 'enabled' | 'disabled' | 'archived';

export interface TrueExitMonitor {
  id: string;
  workspace_id: string;
  category_id: string;
  name: string;
  description: string;
  status: MonitorStatus;
  cadence_seconds: number;
  current_config_version: number;
  config_versions: unknown;
  created_at: string;
  updated_at: string;
}

export interface TrueExitCategory {
  id: string;
  name: string;
  kind: 'global' | 'workspace';
}

export interface CurrentUser {
  user_id: string;
  owned_account_ids: string[];
  personal_workspace_id: string | null;
}

export interface WorkspaceDashboard {
  generated_at: string;
  summary: {
    active_monitors: number;
    disabled_monitors: number;
    evidence_received_recently: number;
    needs_attention: number;
    awaiting_first_evidence: number;
  };
  attention_items: Array<{
    monitor_id: string;
    monitor_name: string;
    reason: 'submission_rejected' | 'evidence_overdue' | string;
    severity: string;
    occurred_at: string | null;
    last_valid_evidence_at: string | null;
    title: string;
    description: string;
    action: { kind: string };
  }>;
  recent_evidence_activity: Array<{
    event_id: string;
    monitor_id: string;
    monitor_name: string;
    event_type: string;
    occurred_at: string;
  }>;
}

export type FieldHealthState =
  'normal' | 'suspected' | 'confirmed' | 'ongoing' | 'recovered' | 'unknown';

export interface FieldHealth {
  state: FieldHealthState;
  consecutive_anomalies?: number;
  consecutive_healthy?: number;
  [key: string]: unknown;
}

export interface HealthSnapshot {
  fields: Record<string, FieldHealth>;
  checkpoints: unknown[];
  adopted_baselines: Record<string, unknown>;
}

export interface CurrentMonitorHealth {
  monitor_id: string;
  config_version: number;
  health: HealthSnapshot;
}

export interface HealthSummary {
  field_count: number;
  normal: number;
  suspected: number;
  confirmed: number;
  ongoing: number;
  recovered: number;
  unknown: number;
}

export interface HealthHistoryEntry {
  config_version: number;
  is_current: boolean;
  health_summary: HealthSummary;
}

export interface HealthHistoryPage {
  monitor_id: string;
  data: HealthHistoryEntry[];
  page: { next_cursor: number | null };
}

export interface HealthVersionDetail {
  monitor_id: string;
  config_version: number;
  is_current: boolean;
  configuration: {
    cadence_seconds?: number;
    config?: unknown;
  };
  health: HealthSnapshot;
}

export class TrueExitApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly requestId: string | null = null
  ) {
    super(message);
    this.name = 'TrueExitApiError';
  }
}

interface RuntimeEnvironment {
  TRUEEXIT_API_BASE_URL?: string;
}

export function getApiBaseUrl(runtime: unknown): string {
  const env = (runtime as { env?: RuntimeEnvironment } | undefined)?.env;
  const value = env?.TRUEEXIT_API_BASE_URL?.trim();

  if (!value) {
    throw new Error('TRUEEXIT_API_BASE_URL is not configured for this deployment.');
  }

  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    throw new Error('TRUEEXIT_API_BASE_URL must use HTTPS outside local development.');
  }

  return url.toString().replace(/\/$/, '');
}

async function request<T>(
  baseUrl: string,
  accessToken: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers as Record<string, string> | undefined)
    },
    redirect: 'manual'
  });

  if (!response.ok) {
    let message = `TrueExit API request failed (${response.status}).`;
    try {
      const body = (await response.json()) as {
        error?: { code?: string; message?: string };
      };
      if (body.error?.code) message = `TrueExit API error: ${body.error.code}.`;
    } catch {
      // Do not expose upstream response bodies or credentials in the UI.
    }
    throw new TrueExitApiError(message, response.status, response.headers.get('X-Request-Id'));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function getCurrentUser(baseUrl: string, accessToken: string) {
  return request<CurrentUser>(baseUrl, accessToken, '/v1/me');
}

export async function getWorkspaces(baseUrl: string, accessToken: string) {
  return request<{ data: TrueExitWorkspace[]; page?: { next_cursor: string | null } }>(
    baseUrl,
    accessToken,
    '/v1/workspaces?limit=100'
  );
}

export async function getWorkspaceDashboard(
  baseUrl: string,
  accessToken: string,
  workspaceId: string
) {
  return request<WorkspaceDashboard>(
    baseUrl,
    accessToken,
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/dashboard`
  );
}

export async function getCategories(baseUrl: string, accessToken: string, workspaceId: string) {
  const query = new URLSearchParams({ workspace_id: workspaceId, limit: '100' });
  return request<{ data: TrueExitCategory[]; page: { next_cursor: string | null } }>(
    baseUrl,
    accessToken,
    `/v1/categories?${query.toString()}`
  );
}

export async function getMonitors(
  baseUrl: string,
  accessToken: string,
  workspaceId: string,
  options: { cursor?: string | null; includeArchived?: boolean } = {}
) {
  const query = new URLSearchParams({ workspace_id: workspaceId, limit: '100' });
  if (options.cursor) query.set('cursor', options.cursor);
  if (options.includeArchived) query.set('include_archived', 'true');
  return request<{ data: TrueExitMonitor[]; page: { next_cursor: string | null } }>(
    baseUrl,
    accessToken,
    `/v1/monitors?${query.toString()}`
  );
}

export async function getMonitor(
  baseUrl: string,
  accessToken: string,
  workspaceId: string,
  monitorId: string
) {
  const query = new URLSearchParams({ workspace_id: workspaceId });
  return request<TrueExitMonitor>(
    baseUrl,
    accessToken,
    `/v1/monitors/${encodeURIComponent(monitorId)}?${query.toString()}`
  );
}

export async function getCurrentMonitorHealth(
  baseUrl: string,
  accessToken: string,
  workspaceId: string,
  monitorId: string
) {
  const query = new URLSearchParams({ workspace_id: workspaceId });
  return request<CurrentMonitorHealth>(
    baseUrl,
    accessToken,
    `/v1/monitors/${encodeURIComponent(monitorId)}/health?${query.toString()}`
  );
}

export async function getMonitorHealthHistory(
  baseUrl: string,
  accessToken: string,
  workspaceId: string,
  monitorId: string,
  options: { cursor?: number | null; limit?: number } = {}
) {
  const query = new URLSearchParams({
    workspace_id: workspaceId,
    limit: String(options.limit ?? 20)
  });
  if (options.cursor) query.set('cursor', String(options.cursor));
  return request<HealthHistoryPage>(
    baseUrl,
    accessToken,
    `/v1/monitors/${encodeURIComponent(monitorId)}/health/history?${query.toString()}`
  );
}

export async function getMonitorHealthVersion(
  baseUrl: string,
  accessToken: string,
  workspaceId: string,
  monitorId: string,
  configVersion: number
) {
  const query = new URLSearchParams({ workspace_id: workspaceId });
  return request<HealthVersionDetail>(
    baseUrl,
    accessToken,
    `/v1/monitors/${encodeURIComponent(monitorId)}/health/history/${configVersion}?${query.toString()}`
  );
}

export async function createMonitor(
  baseUrl: string,
  accessToken: string,
  idempotencyKey: string,
  payload: {
    workspace_id: string;
    category_id: string;
    name: string;
    description: string;
    cadence_seconds: number;
    config: { fields: Array<{ name: string; path: string; primitive: number }> };
  }
) {
  return request<TrueExitMonitor>(baseUrl, accessToken, '/v1/monitors', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey
    },
    body: JSON.stringify(payload)
  });
}

export async function performMonitorAction(
  baseUrl: string,
  accessToken: string,
  workspaceId: string,
  monitorId: string,
  action: 'pause' | 'resume' | 'archive' | 'restore'
) {
  const query = new URLSearchParams({ workspace_id: workspaceId });
  return request<TrueExitMonitor>(
    baseUrl,
    accessToken,
    `/v1/monitors/${encodeURIComponent(monitorId)}/${action}?${query.toString()}`,
    { method: 'POST' }
  );
}
