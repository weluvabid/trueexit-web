import type { QueryClient } from '@tanstack/svelte-query';
import { assertApiSuccess, requestApi } from './api-client';
import { discoveredFieldsResponseSchema, parseApiBody } from './api-schemas';
import { monitorTemplateQueryKeys } from './monitor-queries';
import { templateQueryKeys } from './template-queries';
import type { Template } from './template-types';
import type { TemplatePayload } from './template-model';

export type TemplateWriteMode = 'create' | 'edit';

export type TemplateWriteInput = {
  mode: TemplateWriteMode;
  payload: TemplatePayload;
  idempotencyKey: string;
  template?: Pick<Template, 'id' | 'version'>;
};

function jsonMutationHeaders(idempotencyKey: string): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'Idempotency-Key': idempotencyKey,
  };
}

/** Discover fields from a sample payload using the shared transport and response contract. */
export async function discoverTemplateFields(
  workspaceId: string,
  payload: Record<string, unknown>,
  idempotencyKey: string,
) {
  const result = await requestApi('/api/backend/templates/discover-fields', {
    method: 'POST',
    headers: jsonMutationHeaders(idempotencyKey),
    body: JSON.stringify({ workspace_id: workspaceId, payload }),
  });
  assertApiSuccess(result);
  return parseApiBody(discoveredFieldsResponseSchema, result.body, {
    status: result.response.status,
    requestId: result.requestId,
  });
}

/** Own template writes and their cross-resource cache effects in one place. */
export async function writeTemplate(
  queryClient: QueryClient,
  input: TemplateWriteInput,
): Promise<void> {
  let url = '/api/backend/templates';
  let method: 'POST' | 'PATCH' = 'POST';
  let body: TemplatePayload | (TemplatePayload & { expected_version: number }) = input.payload;

  if (input.mode === 'edit') {
    if (!input.template) throw new Error('Editing a template requires its current identity and version.');
    url = `/api/backend/templates/${encodeURIComponent(input.template.id)}`;
    method = 'PATCH';
    body = { ...input.payload, expected_version: input.template.version };
  }

  const result = await requestApi(url, {
    method,
    headers: jsonMutationHeaders(input.idempotencyKey),
    body: JSON.stringify(body),
  });
  assertApiSuccess(result);
  await invalidateTemplateResources(queryClient);
}

export async function removeTemplate(
  queryClient: QueryClient,
  templateId: string,
  workspaceId: string,
  idempotencyKey: string,
): Promise<void> {
  const result = await requestApi(
    `/api/backend/templates/${encodeURIComponent(templateId)}?workspace_id=${encodeURIComponent(workspaceId)}`,
    { method: 'DELETE', headers: { 'Idempotency-Key': idempotencyKey } },
  );
  assertApiSuccess(result);
  await invalidateTemplateResources(queryClient);
}

async function invalidateTemplateResources(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: templateQueryKeys.all }),
    queryClient.invalidateQueries({ queryKey: monitorTemplateQueryKeys.all }),
  ]);
}
