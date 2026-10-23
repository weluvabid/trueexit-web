export type MonitorStatus = 'enabled' | 'disabled' | 'archived';

export type Monitor = {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  status: MonitorStatus;
  cadence_seconds: number;
  current_config_version: number;
  created_at: string;
  updated_at: string;
};

export type MonitorConfigVersion = {
  version: number;
  cadence_seconds: number;
  config: { fields: Array<{ name: string; path: string; primitive: number; meta?: Record<string, unknown> }> };
};

export type MonitorDetail = Monitor & { config_versions?: MonitorConfigVersion[] };
