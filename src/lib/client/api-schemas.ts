import * as v from 'valibot';
import { ApiClientError } from './api-client';

const nonNegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0));
const nullableTimestamp = v.nullable(v.string());
const monitorStatusSchema = v.picklist(['enabled', 'disabled', 'archived']);
export const primitiveSchema = v.picklist([0, 1, 2, 3, 4, 5, 6, 7]);

export const dashboardResponseSchema = v.object({
  generated_at: v.string(),
  summary: v.object({
    active_monitors: nonNegativeInteger,
    disabled_monitors: nonNegativeInteger,
    evidence_received_recently: nonNegativeInteger,
    needs_attention: nonNegativeInteger,
    awaiting_first_evidence: nonNegativeInteger,
    evidence_outcomes_24h: v.object({
      accepted: nonNegativeInteger,
      rejected: nonNegativeInteger,
      total: nonNegativeInteger,
    }),
    attention_conditions: v.object({
      submission_rejected: nonNegativeInteger,
      evidence_overdue: nonNegativeInteger,
      health_signal: nonNegativeInteger,
    }),
  }),
  attention_items: v.array(v.object({
    monitor_id: v.string(),
    monitor_name: v.string(),
    reason: v.picklist(['submission_rejected', 'evidence_overdue', 'health_signal']),
    severity: v.picklist(['warning']),
    occurred_at: nullableTimestamp,
    last_valid_evidence_at: nullableTimestamp,
    action: v.object({ kind: v.picklist(['view_evidence', 'investigate_monitor']) }),
  })),
  recent_evidence_activity: v.array(v.object({
    event_id: v.string(),
    monitor_id: v.string(),
    monitor_name: v.string(),
    event_type: v.string(),
    occurred_at: v.string(),
  })),
});

export const currentUserContextSchema = v.object({
  user_id: v.string(),
  owned_account_ids: v.array(v.string()),
  personal_workspace_id: v.nullable(v.string()),
});

export const workspaceContextSchema = v.object({
  id: v.string(),
  account_id: v.string(),
  name: v.string(),
  personal: v.boolean(),
  account_owner: v.boolean(),
  role: v.nullable(v.picklist(['admin', 'member'])),
});

export const workspacePageSchema = v.object({
  data: v.array(workspaceContextSchema),
  page: v.object({ next_cursor: v.nullable(v.string()) }),
});

/** Search results are untrusted API data; validate the subset rendered by the shell. */
export const workspaceSearchResponseSchema = v.object({
  results: v.optional(v.object({
    monitors: v.optional(v.object({ data: v.optional(v.array(v.looseObject({
      id: v.string(),
      name: v.string(),
      description: v.optional(v.nullable(v.string())),
    }))) })),
    evidence: v.optional(v.object({ data: v.optional(v.array(v.looseObject({
      monitor_id: v.string(),
      monitor_name: v.optional(v.nullable(v.string())),
      outcome: v.optional(v.nullable(v.string())),
      recorded_at: v.optional(v.nullable(v.string())),
    }))) })),
    templates: v.optional(v.object({ data: v.optional(v.array(v.looseObject({
      id: v.string(),
      name: v.string(),
      kind: v.picklist(['built_in', 'custom']),
      version: nonNegativeInteger,
    }))) })),
    tags: v.optional(v.object({ data: v.optional(v.array(v.looseObject({
      name: v.string(),
      monitor_count: v.optional(nonNegativeInteger),
    }))) })),
  })),
});

export const monitorSchema = v.object({
  id: v.string(),
  workspace_id: v.string(),
  name: v.string(),
  description: v.string(),
  status: monitorStatusSchema,
  cadence_seconds: v.pipe(v.number(), v.integer(), v.minValue(1)),
  current_config_version: nonNegativeInteger,
  created_at: v.string(),
  updated_at: v.string(),
});

export const monitorPageSchema = v.object({
  data: v.array(monitorSchema),
  page: v.optional(v.object({ next_cursor: v.nullable(v.string()) })),
});

export const monitorTemplateSchema = v.object({
  id: v.string(),
  name: v.string(),
  description: v.optional(v.string()),
  fields: v.array(v.object({
    name: v.string(),
    path: v.string(),
    primitive: primitiveSchema,
  })),
});

export const workspaceTagSchema = v.object({
  id: v.string(),
  workspace_id: v.string(),
  name: v.string(),
  monitor_count: nonNegativeInteger,
  created_at: v.string(),
  updated_at: v.string(),
});

export const monitorChannelSchema = v.object({
  id: v.string(),
  label: v.string(),
  type: v.picklist(['email', 'webhook', 'slack', 'discord']),
  enabled: v.boolean(),
  configured: v.boolean(),
});

/** Validate unknown data before allowing it into typed application state. */
export function parseApiBody<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  body: unknown,
  context: { status?: number; requestId?: string | null } = {},
): v.InferOutput<TSchema> {
  const result = v.safeParse(schema, body);
  if (result.success) return result.output;

  throw new ApiClientError(
    'invalid_response',
    'The server returned data that did not match the expected response shape.',
    context.status ?? 200,
    'invalid_response',
    context.requestId ?? null,
    { cause: result.issues },
  );
}

/** Accept the two list envelopes currently emitted by the API, then validate every item. */
export function parseApiList<TSchema extends v.BaseSchema<unknown, unknown, v.BaseIssue<unknown>>>(
  schema: TSchema,
  body: unknown,
  context: { status?: number; requestId?: string | null } = {},
): v.InferOutput<TSchema>[] {
  let rows: unknown;
  if (Array.isArray(body)) {
    rows = body;
  } else if (body && typeof body === 'object' && 'data' in body && Array.isArray(body.data)) {
    rows = body.data;
  } else {
    throw new ApiClientError(
      'invalid_response',
      'The server returned a list response with an unexpected shape.',
      context.status ?? 200,
      'invalid_response',
      context.requestId ?? null,
    );
  }
  return parseApiBody(v.array(schema), rows, context);
}

export const templateSchema = v.object({
  id: v.string(),
  owner_user_id: v.nullable(v.string()),
  kind: v.picklist(['built_in', 'custom']),
  name: v.string(),
  description: v.string(),
  fields: v.array(v.object({
    name: v.string(),
    path: v.string(),
    primitive: primitiveSchema,
    meta: v.optional(v.record(v.string(), v.unknown())),
  })),
  version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  created_at: v.string(),
  updated_at: v.string(),
});

export const templatePageSchema = v.object({
  data: v.array(templateSchema),
  page: v.optional(v.object({ next_cursor: v.nullable(v.string()) })),
});

export const monitorDetailSchema = v.intersect([
  monitorSchema,
  v.object({
    config_versions: v.optional(v.array(v.object({
      version: v.pipe(v.number(), v.integer(), v.minValue(1)),
      cadence_seconds: v.pipe(v.number(), v.integer(), v.minValue(1)),
      config: v.object({
        fields: v.array(v.object({
          name: v.string(),
          path: v.string(),
          primitive: primitiveSchema,
          meta: v.optional(v.record(v.string(), v.unknown())),
        })),
      }),
    }))),
  }),
]);

export const monitorChannelIdsSchema = v.object({ channel_ids: v.array(v.string()) });


// Investigation resources are validated independently because these endpoints
// intentionally expose different projections of monitor/evidence state.
export const investigationMonitorSchema = v.object({
  id: v.string(),
  workspace_id: v.optional(v.string()),
  name: v.string(),
  description: v.optional(v.string()),
  status: monitorStatusSchema,
  cadence_seconds: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  current_config_version: v.optional(nonNegativeInteger),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
  config_versions: v.optional(v.array(v.object({
    version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    cadence_seconds: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
    config: v.object({
      fields: v.optional(v.array(v.object({ name: v.string(), path: v.string(), primitive: primitiveSchema }))),
    }),
  }))),
});

export const investigationEvidenceSchema = v.looseObject({
  id: v.string(),
  request_id: v.string(),
  config_version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  observed_at: v.optional(v.nullable(v.string())),
  created_at: v.optional(v.string()),
  fields: v.optional(v.record(v.string(), v.unknown())),
  reason: v.optional(v.object({ code: v.string(), params: v.optional(v.unknown()) })),
  trace_available: v.optional(v.boolean()),
});

export const investigationDeliverySchema = v.looseObject({
  request_id: v.string(),
  monitor_id: v.optional(v.string()),
  monitor_name: v.optional(v.string()),
  mode: v.optional(v.string()),
  evidence_outcome: v.optional(v.string()),
  created_at: v.optional(v.string()),
  updated_at: v.optional(v.string()),
  status: v.optional(v.string()),
  summary: v.optional(v.record(v.string(), v.unknown())),
});

export const investigationRecordSchema = v.record(v.string(), v.unknown());
export const investigationEvidencePageSchema = v.object({
  data: v.array(investigationEvidenceSchema),
  page: v.optional(v.object({ next_cursor: v.nullable(v.string()) })),
});
export const investigationDeliveryPageSchema = v.object({
  data: v.array(investigationDeliverySchema),
  page: v.optional(v.object({ next_cursor: v.nullable(v.string()) })),
});
export const investigationRecordPageSchema = v.object({
  data: v.array(v.looseObject({
    config_version: v.pipe(v.number(), v.integer(), v.minValue(1)),
    is_current: v.boolean(),
    health_summary: v.optional(v.record(v.string(), v.unknown())),
  })),
  page: v.optional(v.object({ next_cursor: v.nullable(v.string()) })),
});
export const investigationHealthSchema = v.looseObject({
  health: v.optional(v.looseObject({
    fields: v.optional(v.record(v.string(), v.looseObject({
      state: v.optional(v.string()),
      consecutive_anomalies: v.optional(v.unknown()),
      consecutive_healthy: v.optional(v.unknown()),
    }))),
    checkpoints: v.optional(v.unknown()),
    adopted_baselines: v.optional(v.unknown()),
  })),
});
export const investigationHealthVersionSchema = v.looseObject({
  config_version: v.pipe(v.number(), v.integer(), v.minValue(1)),
  is_current: v.boolean(),
  configuration: v.optional(v.looseObject({ cadence_seconds: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1)))) })),
  health: v.optional(v.unknown()),
});

export const discoveredFieldsResponseSchema = v.object({
  fields: v.array(v.object({
    name: v.string(),
    path: v.string(),
    primitive: primitiveSchema,
    meta: v.optional(v.record(v.string(), v.unknown())),
    source_type: v.optional(v.string()),
  })),
  warnings: v.optional(v.array(v.object({ code: v.string() }))),
});

export const settingsAccountSchema = v.object({
  account_id: v.string(),
  lifecycle_status: v.string(),
  scheduled_deletion_at: v.nullable(v.string()),
  billing_cancellation_status: v.nullable(v.string()),
});
export const settingsMemberSchema = v.object({
  user_id: v.string(),
  email: v.string(),
  display_name: v.nullable(v.string()),
  role: v.nullable(v.picklist(['admin', 'member'])),
  account_owner: v.boolean(),
});
export const settingsInvitationSchema = v.object({
  id: v.string(),
  email: v.string(),
  role: v.picklist(['admin', 'member']),
  invited_by_user_id: v.string(),
  expires_at: v.string(),
  created_at: v.optional(v.string()),
  email_delivery: v.optional(v.string()),
});
export const settingsChannelSchema = v.object({
  id: v.string(),
  label: v.string(),
  type: v.picklist(['email', 'webhook', 'slack', 'discord']),
  priority: nonNegativeInteger,
  enabled: v.boolean(),
  configured: v.boolean(),
  total_attempts: v.optional(nonNegativeInteger),
  successful_attempts: v.optional(nonNegativeInteger),
});
export const settingsChannelValidationSchema = v.object({
  valid: v.optional(v.boolean()),
  duplicate: v.optional(v.boolean()),
  existing_channel: v.optional(v.nullable(v.object({ id: v.string(), label: v.string() }))),
});

export const settingsAccountCreateSchema = v.object({
  account_id: v.string(),
  workspace: v.optional(workspaceContextSchema),
});
export const settingsAccountLifecycleSchema = v.object({
  scheduled_deletion_at: v.optional(v.nullable(v.string())),
  lifecycle_status: v.optional(v.string()),
});
export const settingsAcknowledgementSchema = v.union([v.null(), v.record(v.string(), v.unknown())]);

export const dashboardMonitorItemSchema = v.object({
  id: v.string(),
  name: v.string(),
  status: monitorStatusSchema,
  cadence_seconds: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  updated_at: v.optional(v.string()),
});
export const dashboardEvidenceItemSchema = v.looseObject({
  id: v.optional(v.string()),
  event_id: v.optional(v.string()),
  evidence_id: v.optional(v.string()),
  monitor_id: v.optional(v.string()),
  monitor_name: v.optional(v.string()),
  monitor: v.optional(v.looseObject({ name: v.optional(v.string()) })),
  outcome: v.optional(v.string()),
  event_type: v.optional(v.string()),
  created_at: v.optional(v.string()),
  occurred_at: v.optional(v.string()),
});

// Public types are inferred from the same schemas that validate API boundaries.
export type PrimitiveValue = v.InferOutput<typeof primitiveSchema>;
export type DashboardResponseContract = v.InferOutput<typeof dashboardResponseSchema>;
export type DashboardMonitorItem = v.InferOutput<typeof dashboardMonitorItemSchema>;
export type DashboardEvidenceItem = v.InferOutput<typeof dashboardEvidenceItemSchema>;
export type CurrentUserContextContract = v.InferOutput<typeof currentUserContextSchema>;
export type WorkspaceContextContract = v.InferOutput<typeof workspaceContextSchema>;
export type WorkspacePageContract = v.InferOutput<typeof workspacePageSchema>;
export type MonitorContract = v.InferOutput<typeof monitorSchema>;
export type MonitorDetailContract = v.InferOutput<typeof monitorDetailSchema>;
export type MonitorTemplateContract = v.InferOutput<typeof monitorTemplateSchema>;
export type WorkspaceTagContract = v.InferOutput<typeof workspaceTagSchema>;
export type MonitorChannelContract = v.InferOutput<typeof monitorChannelSchema>;
export type TemplateContract = v.InferOutput<typeof templateSchema>;
export type InvestigationMonitorContract = v.InferOutput<typeof investigationMonitorSchema>;
export type InvestigationEvidenceContract = v.InferOutput<typeof investigationEvidenceSchema>;
export type InvestigationDeliveryContract = v.InferOutput<typeof investigationDeliverySchema>;
export type InvestigationHealthVersionContract = v.InferOutput<typeof investigationHealthVersionSchema>;
export type SettingsAccountContract = v.InferOutput<typeof settingsAccountSchema>;
export type SettingsMemberContract = v.InferOutput<typeof settingsMemberSchema>;
export type SettingsInvitationContract = v.InferOutput<typeof settingsInvitationSchema>;
export type SettingsChannelContract = v.InferOutput<typeof settingsChannelSchema>;
