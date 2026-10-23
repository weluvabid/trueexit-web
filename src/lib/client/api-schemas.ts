import * as v from 'valibot';
import { ApiClientError } from './api-client';

const nonNegativeInteger = v.pipe(v.number(), v.integer(), v.minValue(0));
const nullableTimestamp = v.nullable(v.string());
const monitorStatusSchema = v.picklist(['enabled', 'disabled', 'archived']);
const primitiveSchema = v.picklist([0, 1, 2, 3, 4, 5, 6, 7]);

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
          primitive: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(7)),
          meta: v.optional(v.record(v.string(), v.unknown())),
        })),
      }),
    }))),
  }),
]);

export const monitorChannelIdsSchema = v.object({ channel_ids: v.array(v.string()) });
