<svelte:options runes={true} />
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';
  import type { MonitorEditorDraft, FieldPrimitive } from '../lib/client/monitor-editor-state';
  import { buildMonitorJsonDraft, parseMonitorJsonDraft } from '../lib/client/monitor-field-editor';
  import { fetchMonitorTemplates, monitorTemplateQueryKeys, requireMonitorQueryResult, monitorQueryErrorMessage } from '../lib/client/monitor-queries';
  import { getSharedQueryClient } from '../lib/client/query-client';

  let { draft, workspaceId = '', fieldError = $bindable('') }: { draft: MonitorEditorDraft; workspaceId?: string; fieldError?: string } = $props();

  let fieldMode = $state<'json' | 'fields' | 'templates'>('fields');
  let jsonDraft = $state('');
  let jsonError = $state('');

  let templateActionError = $state('');
  let selectedTemplateId = $state('');
  let templateApplyMode = $state<'replace' | 'merge'>('replace');
  let observedWorkspaceId = $state(workspaceId);

  const queryClient = getSharedQueryClient();
  const templatesQuery = createQuery(() => ({
    queryKey: monitorTemplateQueryKeys.workspaceList(workspaceId),
    queryFn: async ({ signal }) => requireMonitorQueryResult(await fetchMonitorTemplates(workspaceId, signal)),
    enabled: fieldMode === 'templates' && Boolean(workspaceId),
    staleTime: 30_000,
    retry: false,
  }), () => queryClient);
  const templates = $derived(templatesQuery.data?.data ?? []);
  const templatesLoading = $derived(fieldMode === 'templates' && Boolean(workspaceId) && templatesQuery.isFetching);
  const templatesError = $derived(templateActionError || (templatesQuery.error ? monitorQueryErrorMessage(templatesQuery.error, messageFor) : ''));

  const primitiveValues: Record<FieldPrimitive, number> = {
    size: 0, count: 1, duration: 2, timestamp: 3, boolean: 4, categorical: 5, checksum: 6, text: 7,
  };
  const primitiveLabels: Record<FieldPrimitive, string> = {
    size: 'Size', count: 'Count', duration: 'Duration', timestamp: 'Timestamp',
    boolean: 'Boolean', categorical: 'Categorical', checksum: 'Checksum', text: 'Text',
  };

  function messageFor(status: number, code: string | null): string {
    if (status === 401) return 'Your session needs attention. Sign in again to continue.';
    if (status === 403) return 'You do not have permission to perform this action in this workspace.';
    if (status === 404) return 'This template or workspace is no longer available.';
    if (status >= 500) return 'TrueExit could not complete this request right now. Try again shortly.';
    if (status === 0) return 'Could not reach TrueExit. Check your connection and try again.';
    return code ? `The request could not be completed (${code}).` : 'The request could not be completed. Please try again.';
  }

  $effect(() => {
    if (workspaceId !== observedWorkspaceId) {
      observedWorkspaceId = workspaceId;
      selectedTemplateId = '';
      templateActionError = '';
    }
  });

  export function reset() {
    fieldMode = 'fields';
    jsonDraft = '';
    jsonError = '';
    templateActionError = '';
    selectedTemplateId = '';
    templateApplyMode = 'replace';
    fieldError = '';
  }

  export function applyPendingJson(): boolean {
    if (fieldMode !== 'json') return true;
    return applyJsonDraft();
  }

  function syncJsonFromFields() {
    try {
      jsonDraft = buildMonitorJsonDraft(draft.fields);
      jsonError = '';
    } catch (error) {
      jsonError = error instanceof Error ? error.message : 'Resolve conflicting paths first.';
      throw error;
    }
  }

  function applyJsonDraft(): boolean {
    try {
      const parsed = parseMonitorJsonDraft(jsonDraft, draft.nextFieldKey);
      draft.fields = parsed.fields;
      draft.nextFieldKey = parsed.nextFieldKey;
      fieldError = '';
      jsonError = '';
      fieldMode = 'fields';
      return true;
    } catch (error) {
      jsonError = error instanceof Error ? error.message : 'Check the JSON and try again.';
      return false;
    }
  }

  function addField() {
    if (draft.fields.length >= 50) return;
    draft.fields = [...draft.fields, { key: draft.nextFieldKey++, name: '', path: '', primitive: 'count' }];
    fieldError = '';
  }

  function removeField(key: number) {
    if (draft.fields.length <= 1) return;
    draft.fields = draft.fields.filter((field) => field.key !== key);
    fieldError = '';
  }

  function applySelectedTemplate() {
    const template = templates.find((item) => item.id === selectedTemplateId);
    if (!template || !template.fields.length) return;
    const mapped = template.fields.map((field) => ({ key: draft.nextFieldKey++, name: field.name, path: field.path, primitive: (Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive }));
    if (mapped.length > 50 || (templateApplyMode === 'merge' && draft.fields.length + mapped.length > 50)) {
      templateActionError = 'The resulting configuration would exceed the 50-field limit. Choose a smaller template or replace the current fields.';
      return;
    }
    if (templateApplyMode === 'merge') {
      const existing = new Set(draft.fields.map((field) => field.path));
      const duplicates = mapped.filter((field) => existing.has(field.path));
      if (duplicates.length) {
        templateActionError = `Cannot merge because these paths already exist: ${duplicates.map((field) => field.path).join(', ')}.`;
        return;
      }
      draft.fields = [...draft.fields, ...mapped];
    } else draft.fields = mapped;
    fieldError = '';
    templateActionError = '';
    fieldMode = 'fields';
  }


</script>

          <div class="monitor-create-section">
            <div class="monitor-create-section__heading"><span>02</span><div><h3>Observed fields <b>*</b></h3><p>Map each field to a value in the JSON payload your process will send to Ping.</p></div><button class="monitor-button monitor-button--quiet" type="button" on:click={addField} disabled={draft.fields.length >= 50}>＋ Add field</button></div>
            <div class="monitor-field-modes" role="tablist" aria-label="Field configuration method">
              <button type="button" role="tab" aria-selected={fieldMode === 'json'} class:active={fieldMode === 'json'} on:click={() => { try { syncJsonFromFields(); fieldMode = 'json'; } catch { /* Error is shown inline. */ } }}>JSON <small>Paste an object</small></button>
              <button type="button" role="tab" aria-selected={fieldMode === 'fields'} class:active={fieldMode === 'fields'} on:click={() => { if (fieldMode === 'json' && jsonDraft.trim()) applyJsonDraft(); else fieldMode = 'fields'; }}>Fields <small>Edit paths</small></button>
              <button type="button" role="tab" aria-selected={fieldMode === 'templates'} class:active={fieldMode === 'templates'} on:click={() => { if (fieldMode === 'json' && jsonDraft.trim()) { applyJsonDraft(); if (fieldMode === 'json') return; } fieldMode = 'templates'; }}>Templates <small>Start from a template</small></button>
            </div>
            {#if fieldError}<p class="monitor-form-error" role="alert">{fieldError}</p>{/if}
            {#if fieldMode === 'json'}
              <div class="monitor-json-mode"><label class="monitor-form-field"><span>JSON payload <b>*</b></span><textarea bind:value={jsonDraft} rows="10" spellcheck="false" class="monitor-json-editor" aria-describedby="monitor-json-help" placeholder={`{
  "backup": {
    "processed_rows": 42,
    "size": 1024
  }
}`}></textarea><small id="monitor-json-help">Paste a representative object. Nested paths are discovered automatically; sample values are used to infer types, not submitted as monitor data.</small></label>
                {#if jsonError}<p class="monitor-form-error" role="alert">{jsonError}</p>{/if}
                <div class="monitor-json-actions"><span>{draft.fields.filter((field) => field.path.trim()).length} configured fields currently in the draft</span><button type="button" class="monitor-button monitor-button--primary" on:click={applyJsonDraft}>Parse JSON into fields <span aria-hidden="true">→</span></button></div>
              </div>
            {:else if fieldMode === 'templates'}
              <div class="monitor-template-mode"><p>Templates provide reusable field names, JSON paths, and interpretation types. They do not change cadence, tags, or destinations.</p>
                {#if templatesError}<p class="monitor-form-error" role="alert">{templatesError}</p>{/if}
                {#if templatesLoading}<p class="monitor-form-hint">Loading templates…</p>{:else if templates.length === 0}<div class="monitor-template-empty"><strong>No templates available</strong><span>Create a reusable field template first, or use JSON to discover fields from a sample payload.</span><a href="/templates">Open Templates ↗</a></div>{:else}
                  <div class="monitor-template-picker"><label class="monitor-form-field"><span>Choose a template</span><select bind:value={selectedTemplateId}><option value="">Select a template…</option>{#each templates as template (template.id)}<option value={template.id}>{template.name} · {template.fields.length} fields</option>{/each}</select></label><label class="monitor-form-field"><span>Apply method</span><select bind:value={templateApplyMode}><option value="replace">Replace current fields</option><option value="merge">Merge with current fields</option></select></label></div>
                  {#if selectedTemplateId}<div class="monitor-template-preview">{#each templates.find((template) => template.id === selectedTemplateId)?.fields ?? [] as field}<div><span><strong>{field.name}</strong><code>{field.path}</code></span><small>{primitiveLabels[(Object.entries(primitiveValues).find(([, value]) => value === field.primitive)?.[0] ?? 'text') as FieldPrimitive]}</small></div>{/each}</div><button type="button" class="monitor-button monitor-button--primary" on:click={applySelectedTemplate}>Apply template to draft →</button>{/if}
                {/if}
              </div>
            {:else}
              <div class="monitor-fields-toolbar"><p>Enter nested JSON paths directly. Use Tab to move through each row; no nested-field builder required.</p><button class="monitor-button monitor-button--quiet" type="button" on:click={addField} disabled={draft.fields.length >= 50}>＋ Add field</button></div>
              <div class="monitor-field-list">
                {#each draft.fields as field, index (field.key)}
                  <div class="monitor-field-card">
                    <div class="monitor-field-card__top"><span>FIELD {String(index + 1).padStart(2, '0')}</span>{#if draft.fields.length > 1}<button type="button" class="monitor-remove-link" on:click={() => removeField(field.key)}>Remove</button>{/if}</div>
                    <div class="monitor-form-grid monitor-form-grid--field">
                      <label class="monitor-form-field"><span>Field name <b>*</b></span><input bind:value={field.name} maxlength="100" required placeholder="processed_rows" /></label>
                      <label class="monitor-form-field"><span>JSON path <b>*</b></span><input bind:value={field.path} maxlength="200" required placeholder="backup.processed_rows" /><small>Dot-separated path in the submitted JSON.</small></label>
                      <label class="monitor-form-field"><span>Value type</span><select bind:value={field.primitive}>{#each Object.keys(primitiveLabels) as primitive}<option value={primitive}>{primitiveLabels[primitive as FieldPrimitive]}</option>{/each}</select></label>
                    </div>
                    {#if field.primitive === 'checksum'}<p class="monitor-field-note">Checksum fields use SHA-256 with hexadecimal encoding.</p>{/if}
                  </div>
                {/each}
              </div>
            {/if}
          </div>

